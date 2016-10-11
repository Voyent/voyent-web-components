Polymer({
    is: "voyent-query-results",
    
    properties: {
        /**
         * The id of the `voyent-query-editor` component.
         */
        for: { type: String },
        /**
         * Defines whether any time fields should use UTC or the local browser timezone
         * @default true
         */
        utc: { type: String, value: "true" }
    },

    ready: function() {
        this._tableHeaders = [];
        this._tableRows = [];
        this._td = '';
        this.timeVar = 'time';
        this.timeDisplayVar = 'timeDisplay';
        this.setupListener();
    },

    /**
     * Adds an event listener for the `queryExecuted` event. Triggered on initialization if there is a valid `for` attribute.
     */
    setupListener: function() {
        var _this = this;

        if (!this._validateFor()) { return; }
        this._queryEditor.addEventListener('queryExecuted', function(e) {
            var records = e.detail.results;
            if (Object.keys(records).length === 0) {
                _this._tableHeaders = [];
                _this._tableRows = [];
                _this.fire('message-error', 'Query results empty');
                console.error('Query results empty');
                return;
            }

            //If the UTC property is false we must change the datetime field (data.time) into local time
            if ((_this.utc != 'true') && (records[0].hasOwnProperty(_this.timeVar))) {
                for (var i = 0; i < records.length; i++) {
                    //don't modify the original time record, store the formatted time in a separate
                    //property that we will display if the user wants to be shown local time.
                    records[i][_this.timeDisplayVar] = _this._formatDate(new Date(records[i].time));
                }
            }

            var uniqueFields = e.detail.uniqueFields;
            var tableColumns={};

            //Collapse the nested properties into their column headers
            for (var j=0; j<uniqueFields.length; j++) {
                var th = uniqueFields[j];
                var dotIndex = th.indexOf('.');
                if (dotIndex > -1) {
                    th = th.substr(0,dotIndex);
                }
                if (!tableColumns[th]) {
                    tableColumns[th] = [];
                }
                tableColumns[th].push(uniqueFields[j]);
            }

            var tableRows=[];
            for (var k=0; k<records.length; k++) {
                _this._row = []; //each record represents one row of data
                for (var columnHeader in tableColumns) {
                    if (!tableColumns.hasOwnProperty(columnHeader)) {
                        continue;
                    }
                    //Loop through all the properties that belong in a single TD (one or more)
                    for (var l=0; l<tableColumns[columnHeader].length; l++) {
                        _this._buildTD(records[k],tableColumns[columnHeader][l]);
                    }
                    //add the TD to the row
                    _this._row.push(_this._td);
                    //reset the TD
                    _this._td='';
                }
                //add the row to the table
                tableRows.push(_this._row);
            }

            _this._tableHeaders = _this._toArray(tableColumns);
            _this._tableRows = tableRows;
        });
    },


    //******************PRIVATE API******************

    /**
     * Checks that the `for` attribute is pointing to a valid element.
     * @return {boolean} Indicates if the for attribute is pointing to a valid `voyent-query-editor`.
     * @private
     */
    _validateFor: function() {
        if (!this.for) {
            this.fire('message-error', 'for attribute is required');
            console.error('for attribute is required');
            return false;
        }
        if (!document.getElementById(this.for)) {
            //traverse through the dom tree to look for the component
            var parent = Polymer.dom(this).parentNode;
            var node;
            while (parent) {
                node = Polymer.dom(parent).querySelector('#'+this.for);
                if (node) {
                    break;
                }
                parent = Polymer.dom(parent).parentNode;
            }
            if (node && node.tagName === 'VOYENT-QUERY-EDITOR') {
                this._queryEditor = node;
                return true;
            }
        }
        else if (document.getElementById(this.for).tagName === 'VOYENT-QUERY-EDITOR') {
            this._queryEditor = document.getElementById(this.for);
            return true;
        }
        this.fire('message-error', 'element cannot be found or is not a voyent-query-editor');
        console.error('element cannot be found or is not a voyent-query-editor');
        return false;
    },
    
    /**
     * Specially formats a date for presentation using a modified long format that includes milliseconds
     * Traditional Date.toString() returns: Fri Nov 20 2015 12:26:38 GMT-0700 (MST)
     * This method would return the above with milliseconds appended as ".XYZ", such as:
     * Fri Nov 20 2015 12:26:38.769 GMT-0700 (MST)
     * This allows greater accuracy when matching the result to a new query editor rule with time
     * @return {string} of the formatted date
     * @private
     */
    _formatDate: function(ISODate) {
        var date = new Date(ISODate);
        // Format the values properly (make sure we have sufficient zeroes)
        var minuteFormatted = ('0'+date.getMinutes()).slice(-2),
            secondFormatted = ('0'+date.getSeconds()).slice(-2),
            millisecondFormatted = ('00'+date.getMilliseconds()).slice(-3);
        // Get the original long format date to parse
        var toParse = date.toString();
        // Now get the time string used in the long format, such as 12:46:35
        var timeString = date.getHours() + ":" + minuteFormatted + ":" + secondFormatted;
        // Now we insert the milliseconds value from the date into our long format string
        var datetime = toParse.substring(0, toParse.indexOf(timeString)+timeString.length) + "." + millisecondFormatted;
        // Now we get the timezone from the original date
        var timezone = toParse.substring(toParse.indexOf(timeString)+timeString.length);
        // Return new modified long format date
        return datetime+timezone;
    },

    /**
     * Generate a TD for the table, combining multiple nested properties into one TD if necessary.
     * @param record
     * @param key
     * @private
     */
    _buildTD: function (record,key) {
        //we have a basic property reference (eg. data.prop)
        if (typeof record[key] !== 'undefined') {
            if (key === this.timeVar) {
                //display the local time if available
                this._td = record[this.timeDisplayVar] ? record[this.timeDisplayVar] : record[this.timeVar];
            }
            else {
                this._td = record[key];
                
                // If we have an array it could be quite large, and have quite big contents
                // So we want to JSON stringify the array and put the results into a readonly text area
                // This is an easy and efficient way to display a ton of JSON
                // Ideally we might revisit this with a custom link that shows a popup or something
                try{
                    if (this._td instanceof Array && this._td.length > 0) {
                        this._td =
                            '<textarea readonly rows="5" style="width: 90%; z-index: 1000; position: relative;">' + JSON.stringify(record[key], null, 4) + '</textarea>';
                    }
                }catch (error) {
                    console.error("Failed to parse array row");
                }
            }
        }
        //we have a nested property reference (eg. data.obj.subprop)
        else if (key.indexOf('.' > -1)) {
            //convert the object dot notation into a mapping to the actual value
            var val = key.split('.').reduce(function(obj,key) {
                //handle array nested properties (eg. data.obj.subprop = [])
                if ($.type(obj) === 'array') {
                    //map property values across objects into a single array
                    var temp = obj.map(function(val,i) {
                        return typeof obj[i][key] !== 'undefined' ? obj[i][key] : null;
                    });
                    //check the array, if it has nothing but null values
                    //then the property wasn't found and we'll return null
                    for (var i=0; i<temp.length; i++) {
                        if (temp[i] !== null) {
                            return temp;
                        }
                    }
                }
                //handle basic nested properties (eg. data.obj.subprop = 'someProp')
                else if (obj && typeof obj[key] !== 'undefined') {
                    return obj[key];
                }
                return null;
            },record);

            //group the nested properties into one TD
            if (val !== null) {
                this._td += '<strong>'+key.substr(key.indexOf('.')+1)+'</strong><br>'+val+'<br>';
            }
        }
        //this record has no data for this property (eg. data.prop = undefined)
        else {
            this._td = null;
        }
    },

    /**
     * Helper function.
     * @param object
     * @returns {Array}
     * @private
     */
    _toArray: function(object) {
        return object ? Object.keys(object).map(function(key) {
            return key;
        }) : [];
    }
});