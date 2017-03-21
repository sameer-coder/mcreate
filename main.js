var restify = require('restify');
var Promise = require('bluebird');

var server = restify.createServer({
    name: 'Mcreate',
    version: '1.0.0'
});

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.listen(8888, function() {
    console.log('%s server listening at %s on port 8888', server.name, server.url);
});

var client = restify.createJsonClient({
    url: 'https://one.nhtsa.gov',
});


//Requirement 1
server.get("/vehicles/:modelYear/:manufacturer/:model", function(req, res, next) {

    if (req.query.withRating === 'true') {
        console.log('Moving to next route', req.query);
        next('With-Rating');
        return;
    }
    console.log("Requirement 1 detected");

    var modelYear = req.params.modelYear;
    var manufacturer = req.params.manufacturer;
    var model = req.params.model;

    //replacing spaces
    modelYear = modelYear.toString().replace(/ /g, '%20')
    manufacturer = manufacturer.toString().replace(/ /g, '%20')
    model = model.toString().replace(/ /g, '%20')

    //Example : https://one.nhtsa.gov/webapi/api/SafetyRatings/modelyear/2015/make/Audi/model/A3?format=json

    getVehiclesFromNhtsa(modelYear, manufacturer, model, function(err, result) {
        if (err) {
            res.json(200, { Count: 0, Results: [] });
        } else {
            res.json(200, result);
        }
    });
});

//Requirement 2
server.post('/vehicles', function(req, res, next) {
    console.log("Requirement 2 detected");

    var modelYear = req.body.modelYear;
    var manufacturer = req.body.manufacturer;
    var model = req.body.model;

    if (!modelYear || !manufacturer || !model) {
        res.json(200, { Count: 0, Results: [] });
    }

    //replacing spaces
    modelYear = modelYear.toString().replace(/ /g, '%20')
    manufacturer = manufacturer.toString().replace(/ /g, '%20')
    model = model.toString().replace(/ /g, '%20')

    //get Vehicles data from Nhtsa
    getVehiclesFromNhtsa(modelYear, manufacturer, model, function(err, result) {
        if (err) {
            res.json(200, { Count: 0, Results: [] });
            return next();

        } else {
            res.json(200, result);
            return next();
        }
    });
});

//Requirement 3
server.get({
    path: '/vehicles/:modelYear/:manufacturer/:model',
    name: 'WithRating'
}, function(req, res, next) {

    console.log("Requirement 3 detected");

    var modelYear = req.params.modelYear;
    var manufacturer = req.params.manufacturer;
    var model = req.params.model;

    //replacing spaces
    modelYear = modelYear.toString().replace(/ /g, '%20')
    manufacturer = manufacturer.toString().replace(/ /g, '%20')
    model = model.toString().replace(/ /g, '%20')

    //Example : https://one.nhtsa.gov/webapi/api/SafetyRatings/modelyear/2015/make/Audi/model/A3?format=json

    getVehiclesFromNhtsa(modelYear, manufacturer, model, function(err, result) {
        if (err) {
            res.json(200, { Count: 0, Results: [] });
            return;
        } else {
            var allVehicles = result['Results'];
            var promises = [];

            for (var i = 0; i < allVehicles.length; i++) {
                promises.push(getCrashInfoFromNhtsa(allVehicles[i].VehicleId));
            }

            var finalCrashData = [];
            Promise.all(promises.map(function(promise) {
                return promise.reflect();
            })).then(function(crashResult) {
                for (var j = 0; j < crashResult.length; j++) {
                    finalCrashData.push(crashResult[j]._settledValueField);
                }
                console.log("All done", finalCrashData);
                res.json(200, { Count: finalCrashData.length, Results: finalCrashData });
            });
        }
    });
});

//Get crash info for a VehicleId
function getCrashInfoFromNhtsa(VehicleId) {

    return new Promise(function(fulfill, reject) {
        if (VehicleId === null || VehicleId === undefined) {
            reject("Invalid input");
        }
        var strGetCrashData = '/webapi/api/SafetyRatings/VehicleId/' + VehicleId + '?format=json';
        client.get(strGetCrashData, function(err, req, res, objNhts) {
            if (err) {
                console.log("Error fetching crash data ", err);
                reject("Error");
            } else {
                var temp = {};
                temp.CrashRating = objNhts['Results'][0].OverallRating;
                temp.Description = objNhts['Results'][0].VehicleDescription;
                temp.VehicleId = objNhts['Results'][0].VehicleId;
                fulfill(temp);
            }
        });
    });
}



function getVehiclesFromNhtsa(modelYear, manufacturer, model, callback) {

    var strGetVehiclesData = '/webapi/api/SafetyRatings/modelyear/' + modelYear + '/make/' + manufacturer + '/model/' + model + '?format=json'

    client.get(strGetVehiclesData, function(err, req, res, objNhts) {
        if (err) {
            console.log("Error fetching vehicles data from nhtsa website", err);
            return callback("Error");
        } else {
            delete objNhts['Message']; //suppresing Message to match spec

            var temp_result = objNhts['Results']; //Renaming VehicleDescription to Description
            for (var i = 0; i < temp_result.length; i++) {
                temp_result[i].Description = temp_result[i].VehicleDescription;
                delete temp_result[i].VehicleDescription
            }
            return callback(null, objNhts);
        }
    });
}