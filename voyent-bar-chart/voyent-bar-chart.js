var poly;
Polymer({
    is: "voyent-bar-chart",

    behaviors: [ChartBehaviors],

    properties: {
        /**
         * Required to authenticate with Voyent.
         * @default voyent.io.auth.getLastAccessToken()
         */
        accesstoken: { type: String, value: voyent.io.auth.getLastAccessToken() },
        /**
         * Defines the Voyent account of the realm.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String, value: voyent.io.auth.getLastKnownAccount() },
        /**
         * Defines the Voyent realm to request data for.
         * @default voyent.io.auth.getLastKnownRealm()
         */
        realm: { type: String, value: voyent.io.auth.getLastKnownRealm()},
        /**
         * Defines whether the bar-chart displays horizontally
         * @default false
         */
        horizontal: {type: Boolean},
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
         * Defines whether the individual bars have their own numbers attached to them
         * @default false
         */
        showbarnumbers: {
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
            type: String,
            value: "default"
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
            var clientWidth = document.getElementsByClassName("wrapper")[0].clientWidth;
            var clientHeight = document.getElementsByClassName("wrapper")[0].clientHeight;
            var margin = {top: 20, right: 30, bottom: 30, left: 40},
                width = poly.showaxes ? clientWidth - margin.left - margin.right : clientWidth,
                height = poly.showaxes ? clientHeight - margin.top - margin.bottom : clientHeight;
            d3.select("#chart").selectAll("*").remove();
            var chart = poly.showaxes ? d3.select("#chart").attr("width", width + margin.right + margin.left).attr("height", height + margin.top + margin.bottom).append("g").attr("id","chartBody")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")") : d3.select("#chart").attr("width", width).attr("height", height);
            var verticalScale;
            var horizontalScale;
            if (poly.horizontal) {
                verticalScale = d3.scale.ordinal().rangeRoundBands([height, 0], 0.01).domain(db.map(function (d) {
                    return String(d.key);
                }));
                horizontalScale = d3.scale.linear().range([0, width]).domain([0, d3.max(db, function (d) {
                    return d.values;
                })]);

                var barHeight = height / db.length;
                var bar = chart.selectAll("g").data(db).enter().append("g").attr("transform", function (d) {
                    return "translate(0," + verticalScale(d.key) + ")";
                });
                bar.append("rect").attr("width", function (d) {
                    return horizontalScale(d.values);
                }).attr("height", verticalScale.rangeBand()).attr("class","bar");
                if (poly.showbarnumbers)
                    bar.append("text").attr("class", "bartext").attr("x", function (d) {
                        return horizontalScale(d.values) - 3
                    }).attr("y", barHeight / 2).attr("dy", ".75em").text(function (d) {
                        return d.values;
                    }).attr("style", "text-anchor: end;");
            }
            else {

                verticalScale = d3.scale.linear().range([height, 0]).domain([0, d3.max(db, function (d) {
                    return d.values;
                })]);
                if (poly.independent == "time"){
                    var dummyDate = {};
                    dummyDate["values"] = 0;
                    dummyDate["key"] = new Date ((+new Date(db[db.length-1].key)) + ChartBehaviors.timeInterval);
                    db.push(dummyDate);
                    horizontalScale = d3.time.scale().range([0,width]).domain(d3.extent(db, function(d) {return new Date(d.key); }));
                }
                else{
                    horizontalScale = d3.scale.ordinal().rangeRoundBands([0, width], 0.01).domain(db.map(function (d) {
                        return String(d.key);
                    }));
                }
                var barWidth = width / db.length;
                var bar = chart.selectAll("g").data(db).enter().append("g").attr("transform", function (d) {
                    return poly.independent == "time" ? "translate(" + horizontalScale(new Date(d.key)) + ",0)":"translate(" + horizontalScale(d.key) + ",0)" ;
                });
                if(poly.independent == "time") {
                    var extent = d3.extent(db, function (d) {
                        return new Date(d.key);
                    });
                    var range = +new Date(extent[1]) - (+new Date(extent[0]));
                    if (range == 0) {
                        barWidth = width;
                        return width;
                    }
                    else {
                        var percentOfTime = ChartBehaviors.timeInterval / range;
                        barWidth = (width * percentOfTime);
                    }
                }
                bar.append("rect").attr("y", function (d) {
                    return verticalScale(d.values);
                }).attr("height", function (d) {
                    return height - verticalScale(d.values);
                }).attr("width", function(){return poly.independent != "time" ? horizontalScale.rangeBand() : barWidth;
                }).attr("class","bar");
                if (poly.showbarnumbers)
                    bar.append("text").attr("class", "bartext").attr("x", barWidth / 2).attr("y", function (d) {
                        return verticalScale(d.values) + 3;
                    }).attr("dy", ".75em").text(function (d) {
                        return d.values;
                    }).attr("style", "text-anchor: middle;");
            }
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
                    .call(xAxis).selectAll("text").style("text-anchor","start").attr("transform",function(d){
                        var textWidth = this.getBBox().width + 20;
                        var angledHeight = Math.abs(textWidth * Math.sin(poly.axisrotationangle * (Math.PI /180)));
                        var angledWidth = Math.abs(textWidth * Math.cos(poly.axisrotationangle * (Math.PI /180))) + 20;
                        var xCoord = d3.transform(this.parentNode.getAttribute("transform")).translate[0];
                        //d3.select(this).attr("transform")
                        if(angledHeight > margin.bottom){
                                poly.$$("#chart").setAttribute("height", String(Number(poly.$$("#chart").getAttribute("height")) + angledHeight - margin.bottom));
                                margin.bottom = angledHeight;
                        }
                        if((xCoord + angledWidth) > Number(poly.$$("#chart").getAttribute("width"))){
                            poly.$$("#chart").setAttribute("width", String(xCoord + angledWidth));
                        }
                        return "rotate("+poly.axisrotationangle+")"
                        }
                );

                chart.append("g")
                    .attr("class", "y axis")
                    .call(yAxis).selectAll("text").attr("transform",function(d){
                        var textWidth = this.getBBox().width + 10;
                        if (textWidth > margin.left){
                            var chartsize = Number(poly.$$("#chart").getAttribute("width")) - margin.left;
                            margin.left = textWidth;
                            poly.$$("#chart").setAttribute("width",String(margin.left + chartsize));
                            d3.select("#chartBody").attr("transform", "translate("+ textWidth +")");
                        }
                    });
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
        voyent.io.metrics.findEvents({
            account: this.account,
            realm: this.realm,
            accessToken: this.accesstoken,
            fields: makeFields,
            query: makeQuery,
            options: {limit: this.maxresults}
        }).then(function (results) {

            if(results.length == 0){
                _this.fire("message-error", "No results found");
                console.error('No results found');
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
            _this.fire("message-error", "findEvents failed: " + error);
            console.error('findEvents failed:',error);
        });
    }
});