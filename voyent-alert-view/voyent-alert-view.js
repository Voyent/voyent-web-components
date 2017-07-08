Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],

    /**
     * Updates the view with the last location of the Alert associated
     * with the templateId and refreshes the current user's location.
     * @param templateId
     */
    updateView: function(templateId) {
        if (!templateId || typeof templateId !== 'string') { return; }
        var _this = this;
        var promises = [];
        promises.push(this._fetchAlertTemplate(templateId));
        promises.push(this.refreshAlertLocation(templateId));
        Promise.all(promises).then(function() {
            //Fit and pan the map to show the alert and current user.
            var bounds = new google.maps.LatLngBounds();
            if (_this._alerts && _this._alerts.length) {
                var zones = _this._alerts[0].alertTemplate.zones.features;
                 for (var i=0; i<zones.length; i++) {
                     bounds.extend(zones[i].tmpProperties.circle.getBounds().getNorthEast());
                     bounds.extend(zones[i].tmpProperties.circle.getBounds().getSouthWest());
                }
            }
            if (_this._userData) { bounds.extend(_this._userData.marker); }
            _this._map.fitBounds(bounds);
            _this._map.panToBounds(bounds);
        }).catch(function(error) {
            _this.fire('message-error', 'Issue refreshing the view: ' + error.responseText || error.message || error);
            console.error('Issue refreshing the view:', error.responseText || error.message || error);
        });
        //Fetch the user's last known location.
        this.refreshUserLocation();
    },

    /**
     * Fetches the last known location of the current user and refreshes their position on the map.
     */
    refreshUserLocation: function() {
        return this._fetchLocationRecord();
    },

    /**
     * Fetches the last known location of the alert associated with
     * the passed templateId and refreshes the position on the map.
     * @param templateId
     */
    refreshAlertLocation: function(templateId) {
        return this._fetchLocationRecord(templateId);
    },

    //******************PRIVATE API******************

    _onAfterLogin: function() {
        //Similar to the alert-editor, we'll use the alerts array.
        this._alerts = [];
    },

    /**
     * Loads an Alert Template into the editor using the passed id.
     * @param id
     */
    _fetchAlertTemplate: function(id) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            voyent.locate.findTrackers({
                realm: this.realm,
                account: this.account,
                query: {"_id":id}
            }).then(function (results) {
                if (!results || !results.length) {
                    _this.fire('message-error', 'Alert Template not found');
                    return;
                }
                _this._currentTemplate = results[0];
                resolve(results[0]);
            }).catch(function (error) {
                _this.fire('message-error', 'Error loading or drawing saved Alert Template: ' + error);
                reject(error);
            });
        });
    }
});
