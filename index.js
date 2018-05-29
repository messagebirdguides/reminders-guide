// Load dependencies
var express = require('express');
var exphbs  = require('express-handlebars');
var bodyParser = require('body-parser');
var moment = require('moment');

// Load configuration from .env file
require('dotenv').config();

// Load and initialize MesageBird SDK
var messagebird = require('messagebird')(process.env.MESSAGEBIRD_API_KEY);

// Set up Appointment "Database"
var AppointmentDatabase = [];

// Set up and configure the Express framework
var app = express();
app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');
app.use(bodyParser.urlencoded({ extended : true }));

// Display booking homepage
app.get('/', function(req, res) {
    // On the form, We're showing a default appointment
    // time 3:10 hours from now to simplify testing input
    var defaultDT = moment().add({hours:3, minutes:10});
    res.render('home', {
        date : defaultDT.format('Y-MM-DD'),
        time : defaultDT.format('HH:mm')
    });
});

// Process an incoming booking
app.post('/book', function(req, res) {
    
    // Check if user has provided input for all form fields
    if (!req.body.name || !req.body.treatment || !req.body.number || !req.body.date || !req.body.time
        || req.body.name == '' || req.body.treatment == '' || req.body.number == ''
        || req.body.date == '' || req.body.time == '') {
            // If not, show an error
            res.render('home', {
                error : "Please fill all required fields!",
                name : req.body.name,
                treatment : req.body.treatment,
                number: req.body.number,
                date : req.body.date,
                time : req.body.time
            });
            return;
    }

    // Check if date/time is correct and at least 3:05 hours in the future
    var earliestPossibleDT = moment().add({hours:3, minutes:5});
    var appointmentDT = moment(req.body.date+" "+req.body.time);
    if (appointmentDT.isBefore(earliestPossibleDT)) {
        // If not, show an error
        res.render('home', {
            error : "You can only book appointments that are at least 3 hours in the future!",
            name : req.body.name,
            treatment : req.body.treatment,
            number: req.body.number,
            date : req.body.date,
            time : req.body.time
        });
        return;
    }

    // Check if phone number is valid
    messagebird.lookup.read(req.body.number, process.env.COUNTRY_CODE, function (err, response) {
        console.log(err);
        console.log(response);

        if (err && err.errors[0].code == 21) {
            // This error code indicates that the phone number has an unknown format
            res.render('home', {
                error : "You need to enter a valid phone number!",
                name : req.body.name,
                treatment : req.body.treatment,
                number: req.body.number,
                date : req.body.date,
                time : req.body.time
            });
            return;
        } else
        if (err) {
            // Some other error occurred
            res.render('home', {
                error : "Something went wrong while checking your phone number!",
                name : req.body.name,
                treatment : req.body.treatment,
                number: req.body.number,
                date : req.body.date,
                time : req.body.time
            });
        } else
        if (response.type != "mobile") {
            // The number lookup was successful but it is not a mobile number
            res.render('home', {
                error : "You have entered a valid phone number, but it's not a mobile number! Provide a mobile number so we can contact you via SMS.",
                name : req.body.name,
                treatment : req.body.treatment,
                number: req.body.number,
                date : req.body.date,
                time : req.body.time
            });
        } else {
            // Everything OK

            // Schedule reminder 3 hours prior to the treatment
            var reminderDT = appointmentDT.clone().subtract({hours: 3});

            // Send scheduled message with MessageBird API
            messagebird.messages.create({
                originator : "BeautyBird",
                recipients : [ response.phoneNumber ], // normalized phone number from lookup request
                scheduledDatetime : reminderDT.format(),
                body : req.body.name + ", here's a reminder that you have a " + req.body.treatment + " scheduled for " + appointmentDT.format('HH:mm') + ". See you soon!"
            }, function (err, response) {
                if (err) {
                    // Request has failed
                    console.log(err);
                    res.send("Error occured while sending message!");
                } else {
                    // Request was successful
                    console.log(response);

                    // Create and persist appointment object
                    var appointment = {
                        name : req.body.name,
                        treatment : req.body.treatment,
                        number: req.body.number,
                        appointmentDT : appointmentDT.format('Y-MM-DD HH:mm'),
                        reminderDT : reminderDT.format('Y-MM-DD HH:mm')
                    }
                    AppointmentDatabase.push(appointment);
    
                    // Render confirmation page
                    res.render('confirm', appointment);    
                }
            });
        }     
      });
});

// Start the application
app.listen(8080);