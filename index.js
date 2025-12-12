const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000

const admin = require("firebase-admin");

const serviceAccount = require('./digital-life-lessons-firebase-adminsdk.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
//middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ message: 'unathorized access' })
    }
    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyFBToken(idToken);
        console.log('decoded in the token', decoded)
        req.decoded_email = decoded.email;
        next();
    }
    catch (err) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cerdjzv.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db('digital_life_lessons_db')
        const digitalLifeCollection = db.collection('life_lessons')
        const userCollection = db.collection('users');
        const lessonsReportsCollection = db.collection('report_lessons')
        //users api
        app.get('/users', async (req, res) => {
            const query = {}
            const result = await userCollection.find(query).toArray();
            res.send(result)
        })
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const result = await userCollection.findOne(query);
            res.send(result);
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'user';
            user.isPremium = false;
            user.createAt = new Date();
            const email = user.email;
            const userExists = await userCollection.findOne({ email });
            if (userExists) {
                return res.send({ message: 'user exists' });
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
        })
        //life_lessons api

        app.get('/life_lessons', async (req, res) => {
            const query = {};
            const result = await digitalLifeCollection.find(query).sort({ createAt: -1 }).toArray();
            res.send(result);
        })
        // 2. Get single lesson by ID
        app.get('/life_lessons/id/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await digitalLifeCollection.findOne(query);

                if (!result) {
                    return res.status(404).send({ message: "Lesson not found" });
                }

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        })
        app.get('/life_lessons/email/:email', async (req, res) => {
            try {
                const email = req.params.email;

                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const result = await digitalLifeCollection.find({ email }).toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });


        app.post('/life_lessons', async (req, res) => {
            const card = req.body;
            card.createAt = new Date();
            const result = await digitalLifeCollection.insertOne(card);
            res.send(result);
        })
        app.patch('/life_lessons/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const { action, userEmail } = req.body;

                if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

                const query = { _id: new ObjectId(id) };
                const lesson = await digitalLifeCollection.findOne(query);
                if (!lesson) return res.status(404).send({ message: "Lesson not found" });

                let updateDoc = {};

                if (action === 'like') {

                    if (!userEmail) return res.status(400).send({ message: "userEmail is required for like action" });

                    const likedUsers = lesson.likeUsers || [];
                    if (likedUsers.includes(userEmail)) {

                        updateDoc = {
                            $pull: { likeUsers: userEmail },
                            $set: { like: Math.max((lesson.like || 0) - 1, 0) }
                        };
                    } else {

                        updateDoc = {
                            $addToSet: { likeUsers: userEmail },
                            $set: { like: (lesson.like || 0) + 1 }
                        };
                    }
                } else if (action === 'favorite') {
                    const newFavorite = lesson.favorites === "Add" ? "Remove" : "Add";
                    updateDoc = { $set: { favorites: newFavorite } };
                } else {
                    return res.status(400).send({ message: "Invalid action" });
                }

                const result = await digitalLifeCollection.updateOne(query, updateDoc);
                res.send(result);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });

        //report collections
        app.post('/report_lessons', async (req, res) => {
            try {
                const { lessonId, reporterUserId, reportedUserEmail, reason } = req.body;

               
                if (!lessonId || !reporterUserId || !reportedUserEmail || !reason) {
                    return res.status(400).json({
                        success: false,
                        message: "All fields are required"
                    });
                }

                if (!ObjectId.isValid(reporterUserId)) {
                    const user = await userCollection.findOne({ email: reporterUserId });
                    if (!user) {
                        return res.status(404).json({
                            success: false,
                            message: "User not found"
                        });
                    }
                    reporterUserId = user._id; 
                }

                // Check if lesson exists
                const lesson = await digitalLifeCollection.findOne({
                    _id: new ObjectId(lessonId)
                });

                if (!lesson) {
                    return res.status(404).json({
                        success: false,
                        message: "Lesson not found"
                    });
                }

                // Check if user is reporting their own lesson
                const reporterUser = await userCollection.findOne({
                    _id: new ObjectId(reporterUserId)
                });

                if (reporterUser.email === reportedUserEmail) {
                    return res.status(400).json({
                        success: false,
                        message: "You cannot report your own lesson"
                    });
                }

                // Create report document
                const reportDoc = {
                    lessonId: new ObjectId(lessonId),
                    reporterUserId: new ObjectId(reporterUserId),
                    reportedUserEmail,
                    reason,
                    timestamp: new Date(),
                    status: 'pending'
                };

                const result = await lessonsReportsCollection.insertOne(reportDoc);

                res.status(201).json({
                    success: true,
                    message: "Report submitted successfully",
                    insertedId: result.insertedId
                });

            } catch (error) {
                console.error('Report submission error:', error);
                res.status(500).json({
                    success: false,
                    message: "Internal server error",
                    error: error.message
                });
            }
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
    res.send('Digital life Lessons running...!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})