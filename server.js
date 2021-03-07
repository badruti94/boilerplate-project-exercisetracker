const express = require('express')
const app = express()
const cors = require('cors')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
require('dotenv').config()

app.use(cors())
app.use(express.static('public'))
app.use(bodyParser.urlencoded({
  extended: false
}))

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})

const Schema = mongoose.Schema
const exerciseScheme = new Schema({
  username: {
    type: String,
    required: true
  },
  log: [{
    description: String,
    duration: Number,
    date: Date
  }]
})

const Exercise = mongoose.model('Exercise', exerciseScheme)

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

app.get('/tes', (req, res) => {
  res.end(req.query.id)
})

app.post('/api/exercise/new-user', (req, res) => {
  Exercise({
    username: req.body.username
  }).save((err, data) => {
    if (err) return console.error(err);
    const {
      _id,
      username
    } = data

    res.json({
      username,
      _id
    })
  })
})

app.post('/api/exercise/add', (req, res) => {
  Exercise.findById(req.body.userId, (err, exercise) => {
    if (err) console.error(err);

    let date = req.body.date
    if (date === "") {
      const today = new Date()
      date = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
    }

    console.log(date);
    exercise.log.push({
      description: req.body.description,
      duration: req.body.duration,
      date: date
    })

    exercise.save((err, updateExercise) => {
      if (err) return console.error(err);
      const {
        username
      } = updateExercise

      res.json({
        _id: req.body.userId,
        username: username,
        date: new Date(date).toDateString(),
        duration: parseInt(req.body.duration),
        description: req.body.description,
      })
    })
  })
})

app.get('/api/exercise/users', (req, res) => {
  Exercise.find({}).select('_id username')
    .exec((err, users) => {
      res.json({
        users: users
      })
    })
})

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
      res.json({
        status: 400,
        message: "Exercise limit must be a number."
      });
      return;
    }
    try {
      let user = await User.findOne({
        _id: req.params.userId
      });

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

      queryArray.push({
        $unwind: "$exercises"
      });
      if (req.query.from) {
        queryArray.push({
          $match: {
            "exercises.date": {
              $gte: req.query.from
            }
          }
        });
      }
      if (req.query.to) {
        queryArray.push({
          $match: {
            "exercises.date": {
              $lte: req.query.to
            }
          }
        });
      }
      if (req.query.limit) {
        queryArray.push({
          $limit: Number(req.query.limit)
        })
      }
      queryArray.push({
        $sort: {
          "exercises.date": -1
        }
      });
      queryArray.push({
        $group: {
          _id: "$_id",
          exercises: {
            $push: "$exercises"
          }
        }
      });

      console.log("builtArray", queryArray);
      // console.log("array", array);

      User.aggregate(
        queryArray,
        function (err, data) {
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
        res.json({
          status: 400,
          dbMessage: err.message,
          userMessage: "There are no users matching the given user id."
        });
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
      let user = await User.findOne({
        _id: req.params.userId
      });
      res.json({
        user: user,
        totalExerciseCount: user.exercises.length
      });
    } catch (err) {
      console.log(err);
      if (err.name === "CastError") {
        res.json({
          status: 400,
          message: err.message
        });
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




const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})