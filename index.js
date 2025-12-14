const express = require('express');
const cors = require('cors');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

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
        const usersCollections = db.collection('users');

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
            lessons.createdDate = new Date();
            const result = await lessonsCollections.insertOne(lessons);
            res.send(result)
        })

        // not finished and didn't work
        app.patch('/lessons/:id', async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            const query = { _id: new ObjectId(id) };

            const updatedDoc = {
                $set: updatedData
            }

            const result = await lessonsCollections.updateOne(query, updatedDoc);
            res.send(result);
        })

        // app.patch('/lessons/:id', async (req, res) => {
        //     try {
        //         const id = req.params.id;
        //         const updatedData = req.body;

        //         // Validate ObjectId
        //         if (!ObjectId.isValid(id)) {
        //             return res.status(400).json({ message: "Invalid lesson ID" });
        //         }

        //         const query = { _id: new ObjectId(id) };
        //         const updatedDoc = { $set: updatedData };

        //         const result = await lessonsCollections.updateOne(query, updatedDoc);

        //         if (result.matchedCount === 0) {
        //             return res.status(404).json({ message: "Lesson not found" });
        //         }

        //         res.json({ message: "Lesson updated successfully", result });
        //     } catch (error) {
        //         console.error("PATCH /lessons error:", error);
        //         res.status(500).json({ message: "Internal server error", error });
        //     }
        // });


        app.delete('/lessons/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await lessonsCollections.deleteOne(query);
            res.send(result);
        })

        // payment related apis
        app.post('/create-checkout-session', async (req, res) => {

            const { paymentInfo, userID } = req.body;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
                        price_data: {
                            currency: 'BDT',
                            product_data: {
                                name: 'Premium Lifetime Access',
                            },
                            unit_amount: 150000
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.email,
                mode: 'payment',
                success_url: `${process.env.SITE_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/payment/cancel`,
                metadata: { userId: userID }
            })
            res.send({ url: session.url });
        })

        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            // console.log('session id', sessionId);
            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Session ID is required'
                });
            }
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            console.log('session retrieve', session);

            if (session.payment_status === 'paid') {
                const id = session.metadata.userId;
                const query = { _id: new ObjectId(id) };
                const update = {
                    $set: {
                        paymentStatus: 'paid',
                        isPremium: true,
                        paidAt: new Date(),
                        stripeSessionId: sessionId
                    }
                }
                const result = await lessonsCollections.updateOne(query, update);
                res.send(result)
            }

            res.send({ success: false })
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
