Polymer({
    is: "voyent-alert-badge-chooser",
    behaviors: [Voyent.AlertBehaviour],

    properties: {
        value: {
            type: String,
            value: "info.png",
            notify: true,
            reflectToAttribute: true
        },
        showInstructions: {
            type: Boolean,
            value: true
        },
        defaultList: {
            type: Array,
            value: []
        },
        infoList: {
            type: Array,
            value: []
        },
        criticalList: {
            type: Array,
            value: []
        },
    },
    
    ready: function() {
        this._retrieveList('defaultList');
        this._retrieveList('infoList', 'info');
        this._retrieveList('criticalList', 'critical');
    },
    
    _retrieveList: function(setList, folder) {
        var url = window.location.protocol + "//" + window.location.host + "/vras/images/badges/";
        if (folder) {
            url += folder;
        }
        
        // Blank our list first
        this.set(setList, []);
        
        var _this = this;
        voyent.$.get(url).then(function(res) {
            if (res) {
                var resArray = res.split("\n");
                if (resArray && resArray.length > 0) {
                    var currentVal;
                    for (var resLoop = 0; resLoop < resArray.length; resLoop++) {
                        currentVal = resArray[resLoop];
                        if (currentVal && typeof currentVal === 'string' && currentVal.trim().length > 0 &&
                            (currentVal.toLowerCase().endsWith(".png") ||
                             currentVal.toLowerCase().endsWith(".jpg") ||
                             currentVal.toLowerCase().endsWith(".gif") ||
                             currentVal.toLowerCase().endsWith(".svg"))) {
                            _this.push(setList, currentVal);
                        }
                    }
                }
            }
            else {
                _this.fire('message-error', 'No icon badge files were found at ' + url);
            }
        }).catch(function(error) {
            _this.fire('message-error', 'Failed to retrieve icon badge list, this may result in broken images');
            console.error(error);
        });
    },
    
    selectBadge: function(e) {
        if (e && e.currentTarget && e.currentTarget.dataBadge) {
            this.value = e.currentTarget.dataBadge;
        }
    },
    
    isSelected: function(compareThis, toThis) {
        return compareThis === toThis;
    },
    
    hasList: function(toCheck) {
        return toCheck && typeof toCheck !== 'null' && toCheck.length > 0;
    },
});
