var poly;
Polymer({
    is: "bridgeit-pie-chart",

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
        endrange:{type:String},
        /**
         * How bright the colours of the pie chart should be. Valid options are 'light','bright','dark' and 'random'.
         * @default light
         */
        brightness:{type:String, value:"light"},
        /**
         * The general hue the colours of the pie chart should be. Valid options are 'red','orange','yellow','green','blue','purple','pink','monochrome' and 'random'.
         * @default random
         */
        hue:{type:String, value:"random"}
    },

    created: function () {
        poly = this;
    },

    ready: function () {
    },

    //******************PRIVATE API******************

    _refreshGraph: function () {
        function gotData(db) {
            var width = document.getElementsByClassName("wrapper")[0].clientWidth;
            var height = document.getElementsByClassName("wrapper")[0].clientHeight;
            var radius = Math.min(width, height) / 2;
            d3.select("#chart").selectAll("*").remove();
            d3.select("#chart").attr("width", width).attr("height", height);
            var colourArray = randomColor({count:db.length,hue:poly.hue,luminosity:poly.brightness});
            var colour = d3.scale.ordinal().range(colourArray);
            var arc = d3.svg.arc().outerRadius(radius-10).innerRadius(0);
            var labelArc =  d3.svg.arc().outerRadius(radius - 40).innerRadius(radius - 40);
            var pie = d3.layout.pie().sort(null).value(function(d) {return d.values;});
            var svg = d3.select("#chart").append("svg")
                .attr("width", width)
                .attr("height", height)
                .append("g")
                .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");
            var g = svg.selectAll(".arc")
                .data(pie(db))
                .enter().append("g")
                .attr("class", "arc");
            //Figure out what to pass
            g.append("path")
                .attr("d", arc)
                .style("fill", function(d,i) {return colour(i);});

            g.append("text")
                .attr("transform", function(d) {d.innerRadius = 0;d.outerRadius = radius; return "translate(" + labelArc.centroid(d) + ")"; })
                .attr("text-anchor", "middle")
                .text(function(d) {return d.data.key; });
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