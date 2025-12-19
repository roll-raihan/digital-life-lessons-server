const express = require('express');
const cors = require('cors');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./digital-life-lessons-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {

    const token = req.headers?.authorization;

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        console.log('decoded id token', decoded);
        req.decoded_email = decoded.email;
        next();
    }
    catch (err) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

}

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

        // verify admin before allowing admin activity
        // must use after middleware
        // middleware with database access
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await usersCollections.findOne(query);

            if (!user || user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // users related api
        app.get('/users', verifyFBToken, async (req, res) => {
            // const searchText = req.query.searchText;
            const query = {};
            // if (searchText) {
            //     // query.displayName = { $regex: searchText, $options: 'i' }
            //     query.$or = [
            //         { displayName: { $regex: searchText, $options: 'i' } },
            //         { email: { $regex: searchText, $options: 'i' } },
            //         { role: { $regex: searchText, $options: 'i' } },
            //     ]
            // }
            const cursor = usersCollections.find(query).sort({ createdAt: 1 });
            // .limit(5);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/users/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollections.findOne(query);
            res.send(result);
        })

        app.get('/users/:email/isPremium', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollections.findOne(query);
            res.send(result);
        })

        app.get('/users/:email/role', verifyFBToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollections.findOne(query);
            res.send({ role: user?.role || 'user' });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'user';
            user.createdAt = new Date();
            user.isPremium = false;

            const email = user?.email;

            const userExist = await usersCollections.findOne({ email });
            if (userExist) {
                return res.send({ message: 'user exist' })
            }

            const result = await usersCollections.insertOne(user);
            res.send(result);
        })

        app.patch('/users/:email', verifyFBToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const result = await usersCollections.updateOne(
                { email },
                {
                    $set: {
                        role: 'admin'
                    }
                }
            );
            res.send(result)
        })

        app.delete('/users/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await usersCollections.deleteOne(query);
            res.send(result);
        })

        // lessons related api
        app.get('/lessons', async (req, res) => {
            const query = {};
            const { searchText, category, emotion, email } = req.query;

            // find by email
            if (email) {
                query.email = email
            }

            if (searchText) {
                query.lessonTitle = { $regex: searchText, $options: 'i' };
            }

            if (category) {
                query.lessonCategory = { $regex: category, $options: 'i' };
            }

            if (emotion) {
                query.lessonEmotion = { $regex: emotion, $options: 'i' };
            }

            const cursor = lessonsCollections.find(query).sort({ createdDate: -1 });
            const result = await cursor.toArray();
            res.send(result)
        })

        app.get('/lessons/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await lessonsCollections.findOne(query);
            res.send(result)
        })

        app.get("/lessons/user/public", async (req, res) => {
            try {
                const email = req.query.email;
                console.log('email received', email)

                if (!email) {
                    return res.status(400).send({
                        success: false,
                        message: "User email is required",
                    });
                }
                console.log("lessonsCollections:", !!lessonsCollections);

                const lessons = await lessonsCollections
                    .find({
                        email: email,
                        lessonAccess: "free",
                    })
                    .sort({ createdAt: -1 })
                    .toArray();

                console.log("Lessons found:", lessons.length);

                res.send({
                    success: true,
                    data: lessons,
                });
            } catch (error) {
                console.error("Fetch user public lessons error:", error);
                res.status(500).send({
                    success: false,
                    message: "Failed to fetch lessons",
                });
            }
        });


        app.post('/lessons', verifyFBToken, async (req, res) => {
            const lesson = req.body;
            const emailFromToken = req.decoded_email;

            const user = await usersCollections.findOne({ email: emailFromToken });

            if (!user) {
                return res.status(401).send({ message: 'User not found' });
            }

            if (lesson?.accessLevel === 'premium' && !user?.isPremium) {
                return res.status(403).send({ message: 'Premium required to create premium lessons' })
            }

            const newLesson = {
                ...lesson,
                email: user.email,
                creator: {
                    email: user?.email,
                    name: user?.displayName,
                    photoURL: user?.photoURL,
                },
                createdDate: new Date(),
                // updatedDate: new Date(),
                reactions: 0,
                saves: 0,
            };

            delete newLesson._id;

            const result = await lessonsCollections.insertOne(newLesson);
            res.send(result)
        })

        app.patch('/lessons/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;
            // console.log('updated data: ', updatedData)
            // console.log('id Id: ', id)
            const emailFromToken = req.decoded_email;

            const lesson = await lessonsCollections.findOne({
                _id: new ObjectId(id)
            });

            if (!lesson) return res.status(404).send({ message: 'Lesson not found' });

            // Owner check
            if (lesson.email !== emailFromToken) {
                return res.status(403).send({ message: 'Forbidden: not owner' });
            }

            // actual user exist or not
            const user = await usersCollections.findOne({
                email: emailFromToken
            })
            if (!user) {
                return res.status(401).send({ message: 'User not found' });
            }

            // Premium rule
            if (
                updatedData?.accessLevel === 'premium' &&
                !user?.isPremium
            ) {
                return res.status(403).send({ message: 'Premium required' });
            }

            updatedData.updatedDate = new Date();

            const result = await lessonsCollections.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            );

            res.send(result);
        });

        app.patch('/lessons/:id/feature', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const result = await lessonsCollections.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        isFeatured: true
                    }
                }
            );
            res.send(result)
        })

        app.delete('/lessons/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await lessonsCollections.deleteOne(query);
            res.send(result);
        })

        // payment related apis
        app.post('/create-checkout-session', async (req, res) => {

            const { paymentInfo } = req.body;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
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
                metadata: { userId: paymentInfo?.userId },
                success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`
            })
            res.send({ url: session.url });
        })

        app.patch('/payment-success', async (req, res) => {
            try {
                const sessionId = req.query.session_id;

                if (!sessionId) {
                    return res.status(400).json({ success: false, error: 'Session ID required' });
                }

                const session = await stripe.checkout.sessions.retrieve(sessionId);
                // console.log('retrieved', session)

                if (session.payment_status !== 'paid') {
                    return res.status(400).json({ success: false, error: 'Payment not completed' });
                }

                if (session.payment_status === 'paid') {
                    const email = session.customer_email;
                    const query = { email: email };

                    const updatedDoc = {
                        $set: {
                            paymentStatus: 'paid',
                            isPremium: true,
                            paidAt: new Date(),
                            stripeSessionId: sessionId
                        }
                    }
                    const result = await usersCollections.updateOne(
                        query, updatedDoc
                    );
                    res.send(result)
                }

            } catch (error) {
                console.error('Stripe verification error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Server error verifying payment'
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
    res.send('Digital life lesson server running!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
