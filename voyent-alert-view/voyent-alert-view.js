Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],

    /**
     * Updates the view with the last location of the Alert associated
     * with the templateId and refreshes the current user's location.
     * @param templateId
     */
    updateView: function(templateId) {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!templateId || typeof templateId !== 'string') {
                _this.fire('message-error','Unable to load template, id not provided.');
                return;
            }
            var promises = [];
            promises.push(_this._fetchAlertTemplate(templateId));
            promises.push(_this._fetchLocationRecord(templateId));
            Promise.all(promises).then(function() {
                _this._adjustBounds();
                _this._templateId = _this._alerts[0].alertTemplate._id;
            }).catch(function(error) {
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            //Fetch the location records.
            _this._fetchLocationRecord();
            _this._fetchMyLocations();
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
    },

    /**
     * Fetches the latest location of the current user and refreshes their position on the map.
     */
    refreshUserLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            _this._fetchLocationRecord().then(_this._adjustBounds.bind(_this));
        });
    },

    /**
     * Fetches the latest location of the currently loaded Alert and refreshes the position on the map.
     */
    refreshAlertLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!_this._templateId) { return; }
            _this._fetchLocationRecord(_this._templateId).then(_this._adjustBounds.bind(_this));
        });
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        //Similar to the alert-editor, we'll use the alerts array.
        this._alerts = [];
        //TemplateId will be used to refresh the alert location.
        this._templateId = null;
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
                    _this.fire('message-error', 'Alert Template not found.');
                    reject('Alert Template not found.');
                    return;
                }
                _this._currentTemplate = results[0];
                resolve(results[0]);
            }).catch(function (error) {
                _this.fire('message-error', 'Error fetching saved Alert Template: ' + (error.responseText || error.message || error));
                reject(error);
            });
        });
    },

    /**
     * Adjust the bounds of the map so the alert and user are in view.
     * @private
     */
    _adjustBounds: function() {
        var bounds = new google.maps.LatLngBounds();
        if (this._alerts && this._alerts.length) {
            var zones = this._alerts[0].alertTemplate.zones.features;
            for (var i=0; i<zones.length; i++) {
                bounds.extend(zones[i].tmpProperties.circle.getBounds().getNorthEast());
                bounds.extend(zones[i].tmpProperties.circle.getBounds().getSouthWest());
            }
        }
        if (this._userData) { bounds.extend(this._userData.marker.getPosition()); }
        this._map.fitBounds(bounds);
        this._map.panToBounds(bounds);
    }
});
