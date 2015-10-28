Polymer({

    is: "bridgeit-event-monitor",
    
    /**
     * Display a marble style graph based on the passed metric data
     * @param data array of the metric events to show on the graph
     */
    show: function(data) {
        var vis = d3.select("#eventmonitorsvg");
        var PADDING = 20,
            CIRCLE_RADIUS = 10;
            WIDTH = parseInt(vis.style("width"))-PADDING,
            HEIGHT = parseInt(vis.style("height"));
        
        // Clear our old graph first and reset the cursor
        vis.selectAll("*").remove();
        vis.style("cursor", null);
        
        // Before progressing check if we even have data to graph
        // If we don't we'll disable zoom/drag and show an error message
        if (typeof data == "undefined" || data == null || data.length == 0) {
            console.log("No data was passed to event monitor graph.");
            
            vis.call(d3.behavior.zoom().on("zoom", null));
            vis.call(d3.behavior.drag().on("drag", null));
            
            vis.append("svg:g").attr("class", "axis");
            vis.append("text").text("No event data was found, please try again.")
                .attr("x", PADDING)
                .attr("y", HEIGHT/2)
                .attr("fill", "red");
            
            return;
        }
        
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
        vis.call(d3.behavior.zoom()
            .x(xScale)
            .on("zoom", function() {
                vis.select("g.axis").call(xAxis);
                vis.selectAll("circle")
                    .attr("cx", function(d) { return xScale(new Date(d.time)) });
            })
            .on("zoomstart", function() {
                vis.style("cursor", "zoom-in");
            })
            .on("zoomend", function() {
                vis.style("cursor", null);
            })
        );
        
        // Customize our drag functionality
        vis.call(d3.behavior.drag()
            .on("dragstart", function() {
                vis.style("cursor", "move");
                d3.select("body").style("cursor", "move");
            })
            .on("dragend", function() {
                vis.style("cursor", null);
                d3.select("body").style("cursor", null);                   
            })
        );
        
        // Draw a circle for every piece of data
        var _this = this;
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
                // Check if we're re-clicking the same circle, in which case we want to hide the details
                // This will basically function as a toggle
                if (d == _this.clickedData) {
                    _this.clickedData = null;
                    _this.clickedDataFormatted = null;
                    document.getElementById('eventDetails').style.display = "none";
                    return;
                }
                
                // Otherwise set our data object for display on the page and show the details
                _this.clickedData = d;
                _this.clickedDataFormatted = JSON.stringify(d.data);
                document.getElementById('eventDetails').style.display = "inline";
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