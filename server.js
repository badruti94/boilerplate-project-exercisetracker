const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const validator = require("validator");

mongoose.connect(
  process.env.MONGO_URI,
  { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false },
  err => {
    err ? console.log(err) : console.log("connected to db!");
  }
);

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));

// Set up user schema
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    exercises: [
      {
        description: { type: String, required: true },
        duration: { type: Number, required: true },
        date: { type: String }
      }
    ]
  },
  { collection: "users" }
);

let User = mongoose.model("User", userSchema);

// Routes
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Return all users as array
app.get("/api/exercise/users", async (req, res) => {
  try {
    let users = await User.find({});
    let userData = users.map(user => {
      return {
        username: user.username,
        id: user._id
      };
    });
    res.json(userData);
  } catch (err) {
    console.log(err);
  }
});

// Post new user to db and return json
app.post("/api/exercise/new-user", async (req, res) => {
  try {
    let user = await User.create({
      username: req.body.username,
      exercises: []
    });
    res.json({ username: user.username, id: user._id });
  } catch (err) {
    console.log(err);
    res.json({
      status: 500,
      mongoDbErrMessage: err.errmsg,
      message: "User could not be created."
    });
  }
});

// Post exercise to user in collection
app.post("/api/exercise/add", async (req, res) => {
  if (!req.body.userId || !req.body.description || !req.body.duration) {
    res.json({
      status: 400,
      message:
        "User ID, description, and duration are all required to add this exercise."
    });
    return;
  }
  if (isNaN(Number(req.body.duration))) {
    res.json({ status: 400, message: "Exercise duration must be a number." });
    return;
  }
  if (req.body.date !== "" && !validator.isISO8601(req.body.date)) {
    res.json({
      status: 400,
      message: "Date provided must use correct yyyy-mm-dd format."
    });
    return;
  }
  try {
    // Find user in collection
    let user = await User.findOne({ _id: req.body.userId });
    if (user) {
      try {
        const date = new Date();
        const currentDate = `${date.getFullYear()}-${date.getMonth() +
          1}-${date.getDate()}`;
        const exercise = {
          description: req.body.description,
          duration: req.body.duration,
          date: req.body.date ? req.body.date : currentDate
        };
        // Add exercise to user document and return updated user
        let updatedUser = await User.findOneAndUpdate(
          { _id: req.body.userId },
          { $push: { exercises: exercise } },
          { new: true }
        );
      } catch (err) {
        console.log(err);
        res.json({ status: 500, message: "This user was not updated." });
      }
    } else {
      res.json({
        status: 400,
        message: "There are no users that match that id."
      });
    }
  } catch (err) {
    console.log(err);
    res.json({
      status: 500,
      mongoDbErrMessage: err.errmsg,
      message: "Exercise could not be added."
    });
  }
});

// Get full user  with exercise log & add total exercise count
app.get("/api/exercise/log/:userId", async (req, res) => {
  // Queries exist so return log based on those queries
  if (Object.keys(req.query).length > 0) {
    console.log(req.query);
    if (req.query.from && !validator.isISO8601(req.query.from)) {
      res.json({
        status: 400,
        message: "Date from provided must use correct yyyy-mm-dd format."
      });
      return;
    }
    if (req.query.to && !validator.isISO8601(req.query.to)) {
      res.json({
        status: 400,
        message: "Date to provided must use correct yyyy-mm-dd format."
      });
      return;
    }
    if (req.query.limit && isNaN(Number(req.query.limit))) {
      res.json({ status: 400, message: "Exercise limit must be a number." });
      return;
    }
    try {
      let user = await User.findOne({ _id: req.params.userId });
      
      // https://stackoverflow.com/questions/15993640/mongodb-subdocument-query-to-limit-elements
      // https://stackoverflow.com/questions/44721309/how-to-reverse-an-unwind-aggregation
      
      let queryArray = [];
      
      // Model for array to send into Aggregate
      // const array = [
      //     { $unwind: "$exercises" },
      //     { $match: { "exercises.date": { $gte: req.query.from } } },
      //     // { $limit: Number(req.query.limit) },
      //     { $sort: { "exercises.date": -1 } },
      //     {
      //       $group: {
      //         _id: "$_id",
      //         exercises: { $push: "$exercises" }
      //       }
      //     }
      //   ];
      
      // Selectively build array to send into Aggregate request
      
      queryArray.push({ $unwind: "$exercises" });
      if (req.query.from) {
        queryArray.push({ $match: { "exercises.date": { $gte: req.query.from } } });
      }
      if (req.query.to) {
        queryArray.push({ $match: { "exercises.date": { $lte: req.query.to } } });
      }
      if (req.query.limit) {
        queryArray.push({ $limit: Number(req.query.limit) })
      }
      queryArray.push({ $sort: { "exercises.date": -1 } });
      queryArray.push({ $group: { _id: "$_id", exercises: { $push: "$exercises" } } });
      
      console.log("builtArray", queryArray);
      // console.log("array", array);
      
      User.aggregate(
        queryArray,
        function(err, data) {
          console.log("data", data[0]);
          if (data[0].exercises.length > 0) {
            res.json({
              user: {
                _id: user._id,
                username: user.username,
                exercises: data[0].exercises
              }
            });
          } else {
            res.json({
              user: {
                _id: user._id,
                username: user.username,
                exercises: "No exercises were found for this user with the given parameters."
              }
            });
          }
        }
      );      
    } catch (err) {
      console.log(err);
      if (err.name === "CastError") {
        res.json({ status: 400, dbMessage: err.message, userMessage: "There are no users matching the given user id." });
      } else {
        res.json({
          status: 500,
          message: "Exercise log could not be retrieved for user."
        });
      }
    }
  } else {
    // return full user exercise log
    try {
      let user = await User.findOne({ _id: req.params.userId });
      res.json({ user: user, totalExerciseCount: user.exercises.length });
    } catch (err) {
      console.log(err);
      if (err.name === "CastError") {
        res.json({ status: 400, message: err.message });
      } else {
        res.json({
          status: 500,
          message: "Exercise log could not be retrieved for user."
        });
      }
    }
  }
  return;
});

// Not found middleware
app.use((req, res, next) => {
  return next({ status: 404, message: "not found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});