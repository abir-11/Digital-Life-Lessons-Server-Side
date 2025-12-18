const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000
const stripe = require('stripe')(process.env.STRIPE_SECRET);

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
        });
        
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
        });
        app.patch('/users/:email', async (req, res) => {
            try {

                const email = req.params.email;
                const { displayName, photoURL ,role} = req.body;

                if (!email) {
                    return res.status(400).send({
                        success: false,
                        message: "Email is required"
                    });
                }

                const query = { email };
                const updateDoc = {
                    $set: {
                        displayName: displayName,
                        role:role

                    }
                };
                if (photoURL) {
                    updateDoc.$set.photoURL = photoURL;
                }

                const result = await userCollection.updateOne(query, updateDoc);

                res.send({
                    success: true,
                    modifiedCount: result.modifiedCount,
                    message: "Profile updated successfully"
                });

            } catch (error) {
                console.error("PATCH error:", error);
                res.status(500).send({
                    success: false,
                    message: "Internal Server Error"
                });
            }
        });
        app.delete('/users/:email',async(req,res)=>{
            const email=req.params.email;
            const  query={email};
            const result=await userCollection.deleteOne(query);
            res.send(result);
        })


      //life lessons

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
        //get aggregate to empliment chat
        app.get('/life_lessons/contributions-reaction-per-week',async(req,res)=>{
            const email=req.params.email;
            const pipeline=[
                {
                    $match:{
                        userEmail:email,
                    }
                }
            ]
            const result=await digitalLifeCollection.aggregate(pipeline).toArray();
            res.send(result);
        })
        //lessons delete
        app.delete('/life_lessons/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await digitalLifeCollection.deleteOne(query);
            res.send(result);
        })
        //favorite data
        app.get('/favorite/email/:email', async (req, res) => {
            try {
                const email = req.params.email;
                //console.log(email);

                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const result = await digitalLifeCollection
                    .find({ "favoriteUsers.email": email })
                    .toArray();


                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });
        app.delete('/favorite/remove/:id', async (req, res) => {
            try {
                const lessonId = req.params.id;
                const { email } = req.body; 

                if (!email) {
                    return res.status(400).send({ message: "User email is required" });
                }

                const query = { _id: new ObjectId(lessonId) };
                const updateDoc = {
                    $pull: { favoriteUsers: { email } } 
                };

                const result = await digitalLifeCollection.updateOne(query, updateDoc);

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: "Favorite not found or already removed" });
                }

                res.send({ message: "Favorite removed successfully" });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });


        // Get total lesson count by email
        app.get('/life_lessons/count/:email', async (req, res) => {
            try {
                const email = req.params.email;

                if (!email) {
                    return res.status(400).send({
                        success: false,
                        message: "Email is required"
                    });
                }

                const count = await digitalLifeCollection.countDocuments({ email });

                res.send({
                    success: true,
                    count: count
                });

            } catch (error) {
                console.error(error);
                res.status(500).send({
                    success: false,
                    message: "Internal Server Error"
                });
            }
        });


        app.post('/life_lessons', async (req, res) => {
            const card = req.body;
            card.createAt = new Date();
            const result = await digitalLifeCollection.insertOne(card);
            res.send(result);
        })
        app.patch('/update_lessons/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const { privacy, accessLevel } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid Id" });
                }

                const query = { _id: new ObjectId(id) };

                const updateFields = {};
                if (privacy !== undefined) updateFields.privacy = privacy;
                if (accessLevel !== undefined) updateFields.accessLevel = accessLevel;

                if (Object.keys(updateFields).length === 0) {
                    return res.status(400).send({ message: "Nothing to update" });
                }

                const result = await digitalLifeCollection.updateOne(
                    query,
                    { $set: updateFields }
                );

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });


        // PATCH /life_lessons/:id
        app.patch('/life_lessons/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const { action, photoURL, userEmail, comment } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid ID" });
                }

                const query = { _id: new ObjectId(id) };
                const lesson = await digitalLifeCollection.findOne(query);

                if (!lesson) {
                    return res.status(404).send({ message: "Lesson not found" });
                }

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
                    if (!userEmail) {
                        return res.status(400).send({ message: "userEmail is required for favorite" });
                    }

                    const favoriteUsers = lesson.favoriteUsers || [];

                    // check if user already exists
                    const userIndex = favoriteUsers.findIndex(user => user.email === userEmail);

                    let newStatus = "";

                    if (userIndex !== -1) {
                        // already saved → remove user
                        updateDoc = {
                            $pull: {
                                favoriteUsers: { email: userEmail }
                            },
                            $inc: {
                                totalFavorites: -1
                            }
                        };
                        newStatus = "save";
                    } else {
                        // not saved → add user
                        updateDoc = {
                            $push: {
                                favoriteUsers: { email: userEmail, lesson: "save" }
                            },
                            $inc: {
                                totalFavorites: +1
                            }
                        };
                        newStatus = "unsave";
                    }

                    const result = await digitalLifeCollection.updateOne(query, updateDoc);
                    return res.send({ message: "favorite updated", status: newStatus });
                } else if (action === 'comment') {
                    if (!userEmail || !comment) {
                        return res.status(400).send({ message: "comment & userEmail are required" });
                    }

                    const newComment = {
                        photoURL,
                        userEmail,
                        comment,
                        time: new Date()
                    };

                    // comments array না থাকলে খালি array তৈরি করা
                    if (!lesson.comments) {
                        await digitalLifeCollection.updateOne(query, { $set: { comments: [] } });
                    }

                    updateDoc = { $push: { comments: newComment } };
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

        // get limit emotion

        app.get('/life_lessons/related/:id', async (req, res) => {
            try {
                const { id } = req.params;


                const currentLesson = await digitalLifeCollection.findOne({
                    _id: new ObjectId(id)
                });

                if (!currentLesson) {
                    return res.status(404).send({ message: "Lesson not found" });
                }

                const { emotionalTone } = currentLesson;


                const relatedLessons = await digitalLifeCollection.find({
                    _id: { $ne: new ObjectId(id) },
                    emotionalTone: emotionalTone
                })
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .toArray();

                res.send(relatedLessons);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });
        //payment related apis
        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: { name: 'Premium Access' },
                            unit_amount: 1500 * 100,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                customer_email: paymentInfo.userEmail,

                success_url: `${process.env.SITE_DOMAIN}/payment-success?email=${paymentInfo.userEmail}`,
                cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
            });

            res.send({ url: session.url });
        });
        //make-premium
        app.patch('/make-premium', async (req, res) => {
            const { email } = req.body;

            const result = await userCollection.updateOne(
                { email },
                {
                    $set: {
                        isPremium: true,
                        premiumAt: new Date(),
                    },
                }
            );

            res.send(result);
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
        app.get('/report_lessons',async(req,res)=>{
            const query={}
            const result=await lessonsReportsCollection.find(query).toArray();
            res.send(result)
        })



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