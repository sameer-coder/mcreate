var restify = require('restify');
var Promise = require('bluebird');
var swaggerJSDoc = require('swagger-jsdoc');

var server = restify.createServer({
    name: 'Mcreate',
    version: '1.0.0'
});

// swagger definition
var swaggerDefinition = {
    info: {
        title: 'MCreate Swagger API',
        version: '1.0.0',
        description: 'Documentation for Modus Create Nodejs API',
    },
    host: 'localhost:8888',
    basePath: '/',
};

// options for the swagger docs
var options = {
    // import swaggerDefinitions
    swaggerDefinition: swaggerDefinition,
    apis: ['./main.js'],
};

// initialize swagger-jsdoc
var swaggerSpec = swaggerJSDoc(options);

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.listen(8888, function() {
    console.log('%s server listening at %s on port 8888', server.name, server.url);
});

var client = restify.createJsonClient({
    url: 'https://one.nhtsa.gov',
});


/**
 * @swagger
 * /vehicles/{modelYear}/{manufacturer}/{model}:
 *   get:
 *      tags:
 *       - Vehicles
 *      description: Gets the vehicle data from NHTSA api
 *      produces:
 *        - application/json
 *      parameters:
 *       - name: modelYear
 *         description: Year of vehicle manufacture
 *         in: path
 *         required: true
 *         type: integer
 *       - name: manufacturer
 *         description: Name of vehicle manufacture
 *         in: path
 *         required: true
 *         type: string
 *       - name: model
 *         description: vehicle model
 *         in: path
 *         required: true
 *         type: string
 *      responses:
 *       200:
 *         description: vehicle data returned
 */
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
/**
 * @swagger
 * definition:
 *   VehicleObject:
 *     properties:
 *       modelYear:
 *         type: integer
 *       manufacturer:
 *         type: string
 *       model:
 *         type: integer
 */
/**
 * @swagger
 * /vehicles:
 *   post:
 *     tags:
 *       - Vehicles
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: Vehicle
 *         description: Vehicle object
 *         in: body
 *         required: true,
 *         schema: 
 *              $ref: '#/definitions/VehicleObject'
 *     responses:
 *       200:
 *         description: vehicle data returned
 */
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

/**
 * @swagger
 * /vehicles/{modelYear}/{manufacturer}/{model}?withRating=true:
 *   get:
 *      tags:
 *       - Vehicles
 *      description: Gets the vehicle data and crash information from NHTSA api
 *      produces:
 *        - application/json
 *      parameters:
 *       - name: modelYear
 *         description: Year of vehicle manufacture
 *         in: path
 *         required: true
 *         type: integer
 *       - name: manufacturer
 *         description: Name of vehicle manufacture
 *         in: path
 *         required: true
 *         type: string
 *       - name: model
 *         description: vehicle model
 *         in: path
 *         required: true
 *         type: string
 *      responses:
 *       200:
 *         description: vehicle data returned
 */
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
            var finalCrashData = [];

            for (var i = 0; i < allVehicles.length; i++) {
                promises.push(getCrashInfoFromNhtsa(allVehicles[i].VehicleId));
            }

            //Fetch crash rating for all VehicleIds
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

// serve swagger
server.get('/swagger.json', function(req, res, next) {
    res.send(200, swaggerSpec);
});

server.get(/\/?.*/, restify.serveStatic({
    directory: __dirname,
    default: 'index.html',
    match: /^((?!app.js).)*$/ // we should deny access to the application source
}));



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