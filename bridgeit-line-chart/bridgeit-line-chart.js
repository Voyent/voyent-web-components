var poly;
Polymer({
    is: "bridgeit-line-chart",

    behaviors: [ChartBehaviors],

    properties: {
        /**
         * Required to authenticate with BridgeIt.
         * @default bridgeit.io.auth.getLastAccessToken()
         */
        accesstoken: { type: String, value: bridgeit.io.auth.getLastAccessToken() },
        /**
         * Defines the BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String, value: bridgeit.io.auth.getLastKnownAccount() },
        /**
         * Defines the BridgeIt realm to request data for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String, value: bridgeit.io.auth.getLastKnownRealm()},

        /**
         * Defines what service the metrics should be created for
         */
        service: { type: String},
        /**
         * Defines whether or not the graph should have a labelled X and Y axis
         */
        showaxes: {
            type: Boolean
        },

        /**
         * Defines the dependant variable to use while making a graph. To use an attribute in the data section, omit 'data' for now and just use the name. Ex: 'Data.size' should simply be 'size'.
         */
        dependant: {
            type: String
        },
        /**
         * Defines the independant variable to use while making a graph. To use an attribute in the data section, omit 'data' for now and just use the name. Ex: 'Data.size' should simply be 'size'.
         * Special case: An independant variable of 'time' will plot the dependant variable over time, grouping by whatever period is defined by the 'period' attribute.
         */
        independant: {
            type: String
        },
        /**
         * Defines the operation to apply to the dependant variable. Currently supported operations are 'sum', 'average' and 'count'. Ex: inependant='username',dependant='size',operation='average' will give the average size by username.
         */
        operation: {
            type: String
        },
        /**
         * Only used for 'time' independant variable to determine the grouping periods. Accepted values are 'year','month','day','hour','minute' and 'second'.
         * @default 'hour'
         */
        period: {
            type: String,
            value: "hour"
        },
        /**
         * The degree to rotate x-axis labels.
         * @default 40
         */
        axisrotationangle:{
            type: Number,
            value: 40
        },
        /**
         * The maximum number of results to return.
         * @default 100
         */
        maxresults:{
            type:Number,
            value:100
        },
        /**
         * The host url to get metrics from.
         */
        host: {type: String},
        /**
         * The start of the range of dates to pull metrics from. Send in standard ISO format, or null to ignore.
         * @default null
         */
        startrange:{type:String},
        /**
         * The end of the range of dates to pull metrics from. Send in standard ISO format, or null to ignore.
         * @default null
         */
        endrange:{type:String}
    },

    created: function () {
        poly = this;
    },

    ready: function () {
    },

    //******************PRIVATE API******************

    _refreshGraph: function () {
        function gotData(db) {
            console.log(db);
            var clientWidth = document.getElementsByClassName("wrapper")[0].clientWidth;
            var clientHeight = document.getElementsByClassName("wrapper")[0].clientHeight;
            var margin = {top: 20, right: 30, bottom: 30, left: 40},
                width = poly.showaxes ? clientWidth - margin.left - margin.right : clientWidth,
                height = poly.showaxes ? clientHeight - margin.top - margin.bottom : clientHeight;
            d3.select("#chart").selectAll("*").remove();
            var horizontalScale = poly.independant == "time"? d3.time.scale().range([0,width]) : d3.scale.linear().range([0,width]);
            var verticalScale = d3.scale.linear().range([height,0]);
            var line = d3.svg.line()
                .x(function(d) { return horizontalScale(new Date(d.key)); })
                .y(function(d) { return verticalScale(d.values); });


            var chart = poly.showaxes ? d3.select("#chart").attr("width", width + margin.right + margin.left).attr("height", height + margin.top + margin.bottom).append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")") : d3.select("#chart").attr("width", width).attr("height", height);

            if(poly.independant == "time")
                horizontalScale.domain(d3.extent(db, function(d) { return new Date(d.key); }));
            else {
                horizontalScale.domain(d3.extent(db, function (d) {
                    return Number(d.key);
                }));
                for (var i = 0; i < db.length; i++){
                    db[i]["key"] = parseInt(db[i]["key"]);
                }
            }
            verticalScale.domain(d3.extent(db, function(d) { return d.values; }));

            chart.append("path")
                .datum(db)
                .attr("class", "line")
                .attr("d", line);

            if (poly.showaxes) {
                var xAxis = d3.svg.axis()
                    .scale(horizontalScale)
                    .orient("bottom");
                var yAxis = d3.svg.axis()
                    .scale(verticalScale)
                    .orient("left");
                chart.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis);
                chart.append("g")
                    .attr("class", "y axis")
                    .call(yAxis);
            }

        }
        var makeQuery = {};
        var makeFields = {};
        if (poly.independant == null || poly.independant == "")
            return;
        makeFields[poly.independant] = 1;
        if (poly.dependant != "")
            makeFields[poly.dependant] = 1;
        if (poly.service != "")
            makeQuery["service"] = poly.service;
        poly.startrange = poly.startrange == ""?null:poly.startrange;
        poly.endrange = poly.endrange == ""?null:poly.endrange;
        if((poly.startrange != null)  || (poly.endrange != null)){
            var timeblock = {};
            if(poly.startrange != null)
                timeblock["$gte"] = poly.startrange;
            if(poly.endrange != null)
                timeblock["$lte"] = poly.endrange;
            makeQuery["time"]=timeblock;
        }
        bridgeit.io.metrics.findEvents({
            account: this.account,
            realm: this.realm,
            accessToken: this.accesstoken,
            fields: makeFields,
            query: makeQuery,
            options: {limit: this.maxresults}
        }).then(function (results) {
            //TODO: Change so that you pull fields from data
            if(results.length == 0){
                console.log("No results found");
                return;
            }
            ChartBehaviors.results = results;
            var realDep = ChartBehaviors.getRealVar(poly.dependant);
            var realIndep = ChartBehaviors.getRealVar(poly.independant);
            var data;
            if (realIndep.toLowerCase() == "time")
                data = ChartBehaviors.timeFunction(poly.period, realDep);
            else
                data = ChartBehaviors.parseData(realIndep, realDep);
            gotData(data);
        }).catch(function (error) {
            console.log('findEvents failed ');
            console.log(error);
        });
    }
});