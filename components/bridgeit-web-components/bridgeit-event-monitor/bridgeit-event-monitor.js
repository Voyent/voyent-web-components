Polymer({

    is: "bridgeit-event-monitor",
    properties: {
        /**
         * Required to authenticate with BridgeIt.
         * @default bridgeit.io.auth.getLastAccessToken()
         */
        accesstoken: { type: String, value: bridgeit.io.auth.getLastAccessToken() },
        /**
         * Defines the BridgeIt realm to build queries for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String, value: bridgeit.io.auth.getLastKnownRealm() },
        /**
         * Defines the BridgeIt account to build queries for.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String, value: bridgeit.io.auth.getLastKnownAccount() }
    },
    
    ready: function() {
    },
    
    initMarbles: function(data) {
        var vis = d3.select("#eventmonitorsvg"),
            PADDING = 20,
            CIRCLE_RADIUS = 10;
        var WIDTH = parseInt(vis.style("width"))-PADDING,
            HEIGHT = 50;
        
        // Clear our old graph first
        vis.selectAll("*").remove();
        
        // Build our date scale
        xScale = d3.time.scale().domain([d3.min(data, function(d) {
            return new Date(d.time);
        }), d3.max(data, function(d) {
            return new Date(d.time);
        })]).range([PADDING, WIDTH-PADDING]);
        
        // Use the scale to make an axis
        xAxis = d3.svg.axis().scale(xScale)
                    .orient("bottom")
                    .tickPadding(5);
                    
        // Vertically center the graph
        vis.append("svg:g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + (HEIGHT/2) + ")")
            .call(xAxis);
            
        // Draw a circle for every piece of data
        vis.selectAll("circle.line")
            .data(data)
            .enter().append("circle")
            .attr("cy", HEIGHT/2)
            .attr("cx", function(d) { return xScale(new Date(d.time)) })
            .attr("r", CIRCLE_RADIUS)
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .attr("title", function (d) { return new Date(d.time); })
            .style("fill", function(d) {
                switch (d.service.toLowerCase()) {
                    case 'locate':
                        return "blue";
                    break;
                    case 'query':
                        return "red";
                    break;
                    case 'metrics':
                        return "yellow";
                    break;
                    case 'storage':
                        return "purple";
                    break;
                    case 'docs':
                        return "green";
                    break;
                    default:
                        return "orange";
                }
            })
            .on("click", function(d, i) {
                document.getElementById('eventDetails').style.display = "inline";
                document.getElementById('detailTime').innerHTML = d.time;
                document.getElementById('detailAccount').innerHTML = d.account;
                document.getElementById('detailRealm').innerHTML = d.realm;
                document.getElementById('detailService').innerHTML = d.service;
                document.getElementById('detailEvent').innerHTML = d.event;
                document.getElementById('detailType').innerHTML = d.type;
                document.getElementById('detailUsername').innerHTML = d.username;
                document.getElementById('detailData').innerHTML = d.data;
                document.getElementById('detailId').innerHTML = d._id;                   
            });
    },
    
    hideData: function() {
        document.getElementById('eventDetails').style.display = "none";
    },
});