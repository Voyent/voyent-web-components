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
         * Defines the dependent variable to use while making a graph. To use an attribute in the data section, omit 'data' for now and just use the name. Ex: 'Data.size' should simply be 'size'.
         */
        dependent: {
            type: String
        },
        /**
         * Defines the independent variable to use while making a graph. To use an attribute in the data section, omit 'data' for now and just use the name. Ex: 'Data.size' should simply be 'size'.
         * Special case: An independent variable of 'time' will plot the dependent variable over time, grouping by whatever period is defined by the 'period' attribute.
         */
        independent: {
            type: String
        },
        /**
         * Defines the operation to apply to the dependent variable. Currently supported operations are 'sum', 'average' and 'count'. Ex: independent='username',dependent='size',operation='average' will give the average size by username.
         */
        operation: {
            type: String
        },
        /**
         * Only used for 'time' independent variable to determine the grouping periods. Accepted values are 'year','month','day','hour','minute' and 'second'.
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
         * Boolean attribute that determines whether or not zoom/pan functionality is enabled on the chart
         * @default false
         */
        zoomable:{type:Boolean}

    },

    created: function () {
        poly = this;
    },

    ready: function () {
    },

    //******************PRIVATE API******************

    _refreshGraph: function () {
        function gotData(db) {
            var clientWidth = document.getElementsByClassName("wrapper")[0].clientWidth;
            var clientHeight = document.getElementsByClassName("wrapper")[0].clientHeight;
            var margin = {top: 20, right: 30, bottom: 30, left: 40},
                width = poly.showaxes ? clientWidth - margin.left - margin.right : clientWidth,
                height = poly.showaxes ? clientHeight - margin.top - margin.bottom : clientHeight;
            d3.select("#chart").selectAll("*").remove();
            var horizontalScale = poly.independent == "time"? d3.time.scale().range([0,width]) : d3.scale.linear().range([0,width]);
            var verticalScale = d3.scale.linear().range([height,0]);
            var xAxis = d3.svg.axis()
                .scale(horizontalScale)
                .orient("bottom");
            var yAxis = d3.svg.axis()
                .scale(verticalScale)
                .orient("left");
            if(poly.independent == "time")
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
            var zoom = d3.behavior.zoom().x(horizontalScale).y(verticalScale).scaleExtent([1,10]).on('zoom',zoomed);
            var line = d3.svg.line().interpolate("linear")
                .x(function(d) { return horizontalScale(new Date(d.key)); })
                .y(function(d) { return verticalScale(d.values); });

            var chart = d3.select("#chart").attr("width", width + margin.right + margin.left).attr("height", height + margin.top + margin.bottom);
            if(poly.zoomable)
                chart.call(zoom);
            chart = chart.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

            chart.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + height + ")")
                .call(xAxis);

            chart.append("g")
                .attr("class", "y axis")
                .call(yAxis);

            chart.append("g")
                .attr("class", "y axis")
                .append("text")
                .attr("class", "axis-label")
                .attr("transform", "rotate(-90)")
                .attr("y", (-margin.left) + 10)
                .attr("x", -height/2)
                .text(poly.dependent);


            chart.append("clipPath")
                .attr("id", "clip")
                .append("rect")
                .attr("width", width)
                .attr("height", height);

            chart.append("path")
                .datum(db)
                .attr("class", "line")
                .attr("d", line).attr("clip-path", "url(#clip)");

            /*var points = chart.selectAll('.dots')
                .data(db)
                .enter()
                .append("g")
                .attr("class", "dots")
                .attr("clip-path", "url(#clip)");

            points.selectAll('.dot')
                .data(function(d, index){
                    var a = [];
                    d.forEach(function(point,i){
                        a.push({'index': index, 'point': point});
                    });
                    return a;
                })
                .enter()
                .append('circle')
                .attr('class','dot')
                .attr("r", 2.5)
                .attr('fill', function(d,i){
                    return "blue";
                })
                .attr("transform", function(d) {
                    return "translate(" + x(d.point.x) + "," + y(d.point.y) + ")"; }
            );*/


            function zoomed(){
                chart.select(".x.axis").call(xAxis);
                chart.select(".y.axis").call(yAxis);
                chart.selectAll("path.line").attr('d',line);
                /**
                 * If points are added in.
                 *
                 );
                 */
            }

        }
        var makeQuery = {};
        var makeFields = {};
        if (poly.independent == null || poly.independent == "")
            return;
        makeFields[poly.independent] = 1;
        if (poly.dependent != "")
            makeFields[poly.dependent] = 1;
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
        var _this = this;
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
                _this.fire('message-error', "No results found");
                return;
            }
            ChartBehaviors.results = results;
            var realDep = ChartBehaviors.getRealVar(poly.dependent);
            var realIndep = ChartBehaviors.getRealVar(poly.independent);
            var data;
            if (realIndep.toLowerCase() == "time")
                data = ChartBehaviors.timeFunction(poly.period, realDep);
            else
                data = ChartBehaviors.parseData(realIndep, realDep);
            gotData(data);
        }).catch(function (error) {
            _this.fire('message-error', "findEvents failed: " + error.toSource());
        });
    }
});