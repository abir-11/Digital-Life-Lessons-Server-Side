const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 3000


//middleware
app.use(express.json());
app.use(cors());

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

        const db=client.db('digital_life_lessons_db')
        const digitalLifeCollection=db.collection('life_lessons')
        const userCollection=db.collection('users');

        //users api
        app.post('/users',async(req,res)=>{
            const user=req.body;
            user.role='user';
            user.isPremium=false;
            user.createAt=new Date();
            const email=user.email;
            const userExists=await userCollection.findOne({email});
            if(userExists){
                return res.send({message:'user exists'});
            }
            const result=await userCollection.insertOne(user);
            res.send(result)
        })
        //life_lessons api

        app.get('/life_lessons',async(req,res)=>{

        })

        app.post('/life_lessons',async(req,res)=>{
            const card=req.body;
            card.createAt=new Date();
            const result =await digitalLifeCollection.insertOne(card);
            res.send(result);
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