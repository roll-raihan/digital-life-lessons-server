const express = require('express');
const cors = require('cors');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n2kdiwk.mongodb.net/?appName=Cluster0`;

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

        const db = client.db('life_lessons_db');
        const lessonsCollections = db.collection('lessons');

        // lessons related api
        app.get('/lessons', async (req, res) => {
            const query = {};
            const { email } = req.query;

            // find by email
            if (email) {
                query.email = email
            }

            const cursor = lessonsCollections.find(query);
            const result = await cursor.toArray();
            res.send(result)
        })

        app.post('/lessons', async (req, res) => {
            const lessons = req.body;
            const result = await lessonsCollections.insertOne(lessons);
            res.send(result)
        })

        app.patch('/lessons/:id', async (req, res) => {

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
    res.send('Digital life lesson server running!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
