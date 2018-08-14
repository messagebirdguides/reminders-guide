# SMS Appointment Reminders
### ⏱ 15 min build time

## Why build SMS appointment reminders? 

Booking appointments online from a website or mobile app is quick and easy. Customers just have to select their desired date and time, enter their personal details and hit a button. The problem, however, is that easy-to-book appointments are often just as easy to forget.

For appointment-based services, no-shows are annoying and costly because of the time and revenue lost waiting for a customer instead of serving them, or another customer. Timely SMS reminders act as a simple and discrete nudges, which can go a long way in the prevention of costly no-shows.

## Getting Started

In this MessageBird Developer Guide, we'll show you how to use the MessageBird SMS messaging API to build an SMS appointment reminder application in Node.js. 

This sample application represents the order website of a fictitious online beauty salon called *BeautyBird*. To reduce the growing number of no-shows, BeautyBird now collects appointment bookings through a form on their website and schedules timely SMS reminders to be sent out three hours before the selected date and time.

To look at the full sample application or run it on your computer, go to the [MessageBird Developer Guides GitHub repository](https://github.com/messagebirdguides/reminders-guide) and clone it or download the source code as a ZIP archive. You will need Node and npm to run the example, which you can easily [install from npmjs.com](https://www.npmjs.com/get-npm).

Open a console pointed at the directory into which you've placed the sample application and run the following command to install the [MessageBird SDK for Node.js](https://www.npmjs.com/package/messagebird) and other dependencies:

````bash
npm install
````

## Configuring the MessageBird SDK

The SDK is loaded with the following `require()` statement in `index.js`:

````javascript
// Load and initialize MesageBird SDK
var messagebird = require('messagebird')(process.env.MESSAGEBIRD_API_KEY);
````

The MessageBird API key needs to be provided as a parameter.

 **Pro-tip:** Hardcoding your credentials in the code is a risky practice that should never be used in production applications. A better method, also recommended by the [Twelve-Factor App Definition](https://12factor.net/), is to use environment variables. We've added [dotenv](https://www.npmjs.com/package/dotenv) to the sample application, so you can supply your API key in a file named `.env`, too:

````env
MESSAGEBIRD_API_KEY=YOUR-API-KEY
````

API keys can be created or retrieved from the [API access (REST) tab](https://dashboard.messagebird.com/en/developers/access) in the _Developers_ section of your MessageBird account.

## Collecting User Input

In order to send SMS messages to users, you need to collect their phone number as part of the booking process. We have created a sample form that asks the user for their name, desired treatment, number, date and time. For HTML forms it's recommended to use `type="tel"` for the phone number input. You can see the template for the complete form in the file `views/home.handlebars` and the route that drives it is defined as `app.get('/')` in `index.js`.

## Storing Appointments & Scheduling Reminders

The user's input is sent to the route `app.post('/book')` defined in `index.js`. The implementation covers the following steps:

### Step 1: Check their input

Validate that the user has entered a value for every field in the form.

### Step 2: Check the appointment date and time

Confirm that the date and time are valid and at least three hours and five minutes in the future. BeautyBird won't take bookings on shorter notice. Also, since we want to schedule reminders three hours before the treatment, anything else doesn't make sense from a testing perspective. We recommend using a library such as [moment](https://www.npmjs.com/package/moment), which makes working with date and time calculations a breeze. Don't worry, we've already integrated it into our sample application:

````javascript
// Check if date/time is correct and at least 3:05 hours in the future
var earliestPossibleDT = moment().add({hours:3, minutes:5});
var appointmentDT = moment(req.body.date+" "+req.body.time);
if (appointmentDT.isBefore(earliestPossibleDT)) {
    // If not, show an error
    // ...
````

### Step 3: Check their phone number

Check whether the phone number is correct. This can be done with the [MessageBird Lookup API](https://developers.messagebird.com/docs/lookup#lookup-request), which takes a phone number entered by a user, validates the format and returns information about the number, such as whether it is a mobile or fixed line number. This API doesn't enforce a specific format for the number but rather understands a variety of different variants for writing a phone number, for example using different separator characters between digits, giving your users the flexibility to enter their number in various ways. In the SDK, you can call `messagebird.lookup.read()`:

````javascript
// Check if phone number is valid
messagebird.lookup.read(req.body.number, process.env.COUNTRY_CODE, function (err, response) {
    // ...
````

The function takes three arguments; the phone number, a country code and a callback function. Providing a default country code enables users to supply their number in a local format, without the country code.

To add a country code, add the following line to you `.env` file, replacing NL with your own ISO country code:
````env
COUNTRY_CODE=NL
````

In the callback function, we handle four different cases:
* An error (code 21) occurred, which means MessageBird was unable to parse the phone number.
* Another error code occurred, which means something else went wrong in the API.
* No error occurred, but the value of the response's `type` attribute is something other than `mobile`.
* Everything is OK, which means a mobile number was provided successfully.

````javascript
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
````

The implementation for the following steps is contained within the last `else` block.

### Step 4: Schedule the reminder

Using *moment*, we can easily specify the time for our reminder:

````javascript
// Schedule reminder 3 hours prior to the treatment
var reminderDT = appointmentDT.clone().subtract({hours: 3});
````

Then it's time to call MessageBird's API:

````javascript
// Send scheduled message with MessageBird API
messagebird.messages.create({
    originator : "BeautyBird",
    recipients : [ response.phoneNumber ], // normalized phone number from lookup request
    scheduledDatetime : reminderDT.format(),
    body : req.body.name + ", here's a reminder that you have a " + req.body.treatment + " scheduled for " + appointmentDT.format('HH:mm') + ". See you soon!"
}, function (err, response) {
    // ...
````

Let's break down the parameters that are set with this call of `messagebird.messages.create()`:
- `originator`: The sender ID. You can use a mobile number here, or an alphanumeric ID, like in the example.
- `recipients`: An array of phone numbers. We just need one number, and we're using the normalized number returned from the Lookup API instead of the user-provided input.
- `scheduledDatetime`: This instructs MessageBird not to send the message immediately but at a given timestamp, which we've defined previously. Using moment's `format()` method we make sure the API can read this timestamp correctly.
- `body`: The friendly text for the message.

### Step 5: Store the appointment

We're almost done! The application's logic continues in the callback function for the `messagebird.messages.create()` API call, where we need to handle both success and error cases:

````javascript
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
````

As you can see, for the purpose of the sample application, we simply "persist" the appointment to a global variable in memory. This is where, in practical applications, you would write the appointment to a persistence layer such as a file or database. We also show a confirmation page, which is defined in `views/confirm.handlebars`.

## Testing the Application

Now, let's run the following command from your console:

````bash
node index.js
````

Then, point your browser at http://localhost:8080/ to see the form and schedule your appointment! If you've used a live API key, a message will arrive to your phone three hours before the appointment! But don't actually leave the house, this is just a demo :)


## Nice work!

You now have a running SMS appointment reminder application!

You can now use the flow, code snippets and UI examples from this tutorial as an inspiration to build your own SMS reminder system. Don't forget to download the code from the [MessageBird Developer Guides GitHub repository](https://github.com/messagebirdguides/reminders-guide).

## Next steps

Want to build something similar but not quite sure how to get started? Please feel free to let us know at support@messagebird.com, we'd love to help!
