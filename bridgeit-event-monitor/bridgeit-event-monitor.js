Polymer({

    is: "bridgeit-event-monitor",
    
    /**
     * Display a marble style graph based on the passed metric data
     * @param data array of the metric events to show on the graph
     */
    show: function(data) {
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
            
        // Add zoom functionality
        var zoom = d3.behavior.zoom()
            .x(xScale)
            .on("zoom", function() {
                vis.select("g.axis").call(xAxis);
                vis.selectAll("circle")
                    .attr("cx", function(d) { return xScale(new Date(d.time)) });
            });
        vis.call(zoom);
        
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
    
    //******************PRIVATE API******************
    
    /**
     * Hide our event detail data panel, which would be shown upon clicking on a graph element
     * @private
     */
    _hideData: function() {
        document.getElementById('eventDetails').style.display = "none";
    },
});