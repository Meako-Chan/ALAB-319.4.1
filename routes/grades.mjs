import express from "express";
import db from "../db/conn.mjs";
import { ObjectId } from "mongodb";

const router = express.Router();
//Create indexs and validate grades collection:
async () =>{
  let collection = await db.collection("grades");
  //Create indexes
  
  await collection.createIndex({ class_id: 1});
  await collection.createIndex({ learner_id: 1});
  await collection.createIndex({ learner_id: 1, class_id: 1});

  await db.command({
    collMod: "grades",

    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["class_id", "learner_id"],
        properties: {
          class_id: {
            bsonType: "int",
            minimum: 0,
            maximum: 300,
            description: "must be an integer between 0 and 300 and is required"
          },
          learner_id: {
            bsonType: "int",
            minimum: 0,
            description: "must be an integer greater than or equal to 0 and is required"
          }
      }
    }
  },
  validationAction: "warn"
  });

};
// Create a single grade entry
router.post("/", async (req, res) => {
  let collection = await db.collection("grades");
  let newDocument = req.body;

  // rename fields for backwards compatibility
  if (newDocument.student_id) {
    newDocument.learner_id = newDocument.student_id;
    delete newDocument.student_id;
  }

  let result = await collection.insertOne(newDocument);
  res.send(result).status(204);
});

// Get a single grade entry
router.get("/:id", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { _id: ObjectId(req.params.id) };
  let result = await collection.findOne(query);

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Add a score to a grade entry
router.patch("/:id/add", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { _id: ObjectId(req.params.id) };

  let result = await collection.updateOne(query, {
    $push: { scores: req.body }
  });

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Remove a score from a grade entry
router.patch("/:id/remove", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { _id: ObjectId(req.params.id) };

  let result = await collection.updateOne(query, {
    $pull: { scores: req.body }
  });

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Delete a single grade entry
router.delete("/:id", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { _id: ObjectId(req.params.id) };
  let result = await collection.deleteOne(query);

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Get route for backwards compatibility
router.get("/student/:id", async (req, res) => {
  res.redirect(`learner/${req.params.id}`);
});

// Get a learner's grade data
router.get("/learner/:id", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { learner_id: Number(req.params.id) };
  
  // Check for class_id parameter
  if (req.query.class) query.class_id = Number(req.query.class);

  let result = await collection.find(query).toArray();

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Delete a learner's grade data
router.delete("/learner/:id", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { learner_id: Number(req.params.id) };

  let result = await collection.deleteOne(query);

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Get a class's grade data
router.get("/class/:id", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { class_id: Number(req.params.id) };

  // Check for learner_id parameter
  if (req.query.learner) query.learner_id = Number(req.query.learner);

  let result = await collection.find(query).toArray();

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Update a class id
router.patch("/class/:id", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { class_id: Number(req.params.id) };

  let result = await collection.updateMany(query, {
    $set: { class_id: req.body.class_id }
  });

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

// Delete a class
router.delete("/class/:id", async (req, res) => {
  let collection = await db.collection("grades");
  let query = { class_id: Number(req.params.id) };

  let result = await collection.deleteMany(query);

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

router.get("/stats", async (req, res) => {
  let collection = await db.collection("grades");
  let stats = await collection.aggregate([
    {
      $unwind: { path: "$scores" },
    },
    {
      $group: {
        _id: { learner_id:"$learner_id", class_id:"$class_id"},
        quiz: {
          $push: {
            $cond: {
              if: { $eq: ["$scores.type", "quiz"] },
              then: "$scores.score",
              else: "$$REMOVE",
            },
          },
        },
        exam: {
          $push: {
            $cond: {
              if: { $eq: ["$scores.type", "exam"] },
              then: "$scores.score",
              else: "$$REMOVE",
            },
          },
        },
        homework: {
          $push: {
            $cond: {
              if: { $eq: ["$scores.type", "homework"] },
              then: "$scores.score",
              else: "$$REMOVE",
            },
          },
        },
      },
    },
    {
      $project: {
        learner_id: "$_id.learner_id",
        class_id: "$_id.class_id",
        weightedAvg: {
          $sum: [
            { $multiply: [{ $avg: "$exam" }, 0.5] },
            { $multiply: [{ $avg: "$quiz" }, 0.3] },
            { $multiply: [{ $avg: "$homework" }, 0.2] },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$learner_id",
        avgScore: {$avg: "$weightedAvg"}
      },
    },
    {
      $facet: {
        totalLearners: [{ $count: "total"}],
        above70: [
          {$match: {avgScore: {$gt: 70}} },
          {$count: "count"},
        ],
      },
    },
    {
      $project: {
        totalLearners: {$arrayElemAt: ["$totalLearners.total", 0]},
        above70: {$arrayElemAt: ["$above70.count", 0]},
        percentageAbove70: {
          $multiply: [
            { $divide: [{ $arrayElemAt: ["$above70.count", 0] }, { $arrayElemAt: ["$totalLearners.total", 0] }] },
            100,
          ],
        }
      }
    }
  ])
  .toArray();

  let result = stats[0];

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
})

router.get("/stats/:id", async (req, res) => {
  let collection = await db.collection("grades");
  const classId = Number(req.params.id);

  let stats = await collection.aggregate([
    {
      $match: {class_id: classId }
    },
    {
      $unwind: { path: "$scores" },
    },
    {
      $group: {
        _id: { learner_id:"$learner_id", class_id:"$class_id"},
        quiz: {
          $push: {
            $cond: {
              if: { $eq: ["$scores.type", "quiz"] },
              then: "$scores.score",
              else: "$$REMOVE",
            },
          },
        },
        exam: {
          $push: {
            $cond: {
              if: { $eq: ["$scores.type", "exam"] },
              then: "$scores.score",
              else: "$$REMOVE",
            },
          },
        },
        homework: {
          $push: {
            $cond: {
              if: { $eq: ["$scores.type", "homework"] },
              then: "$scores.score",
              else: "$$REMOVE",
            },
          },
        },
      },
    },
    {
      $project: {
        learner_id: "$_id.learner_id",
        class_id: "$_id.class_id",
        weightedAvg: {
          $sum: [
            { $multiply: [{ $avg: "$exam" }, 0.5] },
            { $multiply: [{ $avg: "$quiz" }, 0.3] },
            { $multiply: [{ $avg: "$homework" }, 0.2] },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$learner_id",
        avgScore: {$avg: "$weightedAvg"}
      },
    },
    {
      $facet: {
        totalLearners: [{ $count: "total"}],
        above70: [
          {$match: {avgScore: {$gt: 70}} },
          {$count: "count"},
        ],
      },
    },
    {
      $project: {
        totalLearners: {$arrayElemAt: ["$totalLearners.total", 0]},
        above70: {$arrayElemAt: ["$above70.count", 0]},
        percentageAbove70: {
          $multiply: [
            { $divide: [{ $arrayElemAt: ["$above70.count", 0] }, { $arrayElemAt: ["$totalLearners.total", 0] }] },
            100,
          ],
        }
      }
    }
  ])
  .toArray();

  let result = stats[0];

  if (!result) res.send("Not found").status(404);
  else res.send(result).status(200);
});

export default router;
