Polymer({
    is: 'voyent-alert-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    ready: function() {
        //Initialize some vars
        this._alertBttnAdded = this._alertBttnSelected =
        this._activatingAlert = this._alertActivated = false;
        this._alertTemplates = null;
        //Add listener to native map button.
        this._addListenerToStopDrawingBttn();
    },

    /**
     * Removes the current Alert Template.
     */
    removeAlertTemplate: function() {
        var confirm = window.confirm("Are you sure you want to delete '" + this._alertTemplateData.alertTemplate.label + "'? This cannot be undone!");
        if (!confirm) {
            return;
        }
        var _this = this;
        //Delete from DB if it's saved.
        if (this._alertTemplateData.isPersisted) {
            voyent.locate.deleteTracker({
                realm: this.realm,
                account: this.account,
                id: this._alertTemplateData.alertTemplate._id
            }).then(function () {
                _this.clearMap();
            }).catch(function (error) {
                _this.fire('message-error', 'Issue deleting Alert Template ' + error);
                console.error('Issue deleting Alert Template', error);
            });
        }
        else { //Otherwise just clear map.
            this.clearMap();
        }
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        var _this = this;

        //Fetch...
        var promises = [];
        //..the Alert Templates...
        promises.push(this._fetchAlertTemplates());
        //...the last locations of all Alerts...
        promises.push(this._executeAggregate(this._lastAlertLocations));
        //...and the last locations for all Users.
        promises.push(this._executeAggregate(this._lastUserLocations));
        Promise.all(promises).then(function() {

        }).catch(function(error) {
            _this.fire('message-error', 'Issue initializing Alert Editor ' + error.responseText || error.message || error);
            console.error('Issue initializing Alert Editor', error.responseText || error.message || error);
        });
    },

    /**
     * Fetches the list of Alert Templates for the realm.
     * @returns {*}
     * @private
     */
    _fetchAlertTemplates: function() {
        var _this = this;
        return new Promise(function (resolve, reject) {
            voyent.locate.getAllTrackers({realm:_this.realm,account:_this.account}).then(function(templates) {
                _this._alertTemplates = templates.filter(function(alertTemplate) {
                    //Don't show child Alert Templates.
                    return !alertTemplate.properties || !alertTemplate.properties.parentTrackerId;
                });
                _this._addAlertButton();
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    },

    /**
     * Executes aggregate queries for getting last user and tracker locations.
     * @param query
     * @private
     */
    _executeAggregate: function(query) {
        var _this = this;
        var id = query._id;
        return new Promise(function (resolve, reject) {
            voyent.query.executeQuery({realm:_this.realm,id:id}).then(function(results) {
                if (id === '_getLastUserLocations') {

                }
                else {

                }
                resolve();
            }).catch(function(error) {
                var res = JSON.parse(error.response);
                if (res.status === 404 ||
                    (res.status === 500 && res.code == 'contextNotFound')) {
                    _this._createAggregate(query).then(function() {
                        resolve();
                    }).catch(function(error){reject(error);});
                }
            });

        });
    },

    /**
     * Creates aggregate queries for getting last user and tracker locations.
     * @param query
     * @private
     */
    _createAggregate: function(query) {
        var _this = this;
        var id = query._id;
        return new Promise(function (resolve, reject) {
            voyent.query.createQuery({realm:_this.realm,id:id,query:query}).then(function() {
                _this._executeAggregate(query).then(function() {
                    resolve();
                }).catch(function(error){reject(error);});
            }).catch(function(error) {
                reject(error);
            });
        });
    },

    /**
     * Aggregate query for getting the last locations of all Users.
     */
    _lastUserLocations: {"_id":"_getLastUserLocations","query":[{"$match":{"_data.location.properties.trackerId":{"$exists":false}}},{"$sort":{"_data.lastUpdated":-1}},{"$group":{"_id":"$_data.username","username":{"$first":"$_data.username"},"location":{"$first":"$_data.location"},"lastUpdated":{"$first":"$_data.lastUpdated"}}},{"$project":{"_id":0,"location":1,"username":1,"lastUpdated":1}}],"properties":{"title":"Find Last User Locations","service":"locate","collection":"locations","type":"aggregate"}},

    /**
     * Aggregate query for getting the last locations of all Alerts.
     */
    _lastAlertLocations: {"_id":"_getLastAlertLocations","query":[{"$match":{"_data.location.properties.trackerId":{"$exists":true}}},{"$sort":{"_data.lastUpdated":-1}},{"$group":{"_id":"$_data.username","location":{"$first":"$_data.location"},"lastUpdated":{"$first":"$_data.lastUpdated"}}},{"$project":{"_id":0,"location":1,"username":1,"lastUpdated":1}}],"properties":{"title":"Find Last Tracker Locations","service":"locate","collection":"locations","type":"aggregate"}},

    /**
     * Handles adding button for creating Alerts.
     * @private
     */
    _addAlertButton: function() {
        if (!this._alertBttnAdded && this._alertTemplates && this._alertTemplates.length) {
            var _this = this;
            var alertBttn = this.$.alertBttn.cloneNode(true);
            alertBttn.onclick = this._selectAlertBttn.bind(this);
            this._map.controls[google.maps.ControlPosition.TOP_RIGHT].push(alertBttn);
            //delay so that the button isn't shown on
            //the page before being moved into the map
            setTimeout(function () {
                alertBttn.hidden = false;
                _this._alertBttnAdded = true;
            }, 100);
        }
    },

    /**
     * Adds a listener to Google's native "Stop Drawing" button so we can de-activate our custom Alert Button.
     * @private
     */
    _addListenerToStopDrawingBttn: function() {
        var _this = this, bttn;
        waitForButton();

        function waitForButton() {
            bttn = _this.querySelector('[title="Stop drawing"]');
            if (!bttn) {
                setTimeout(waitForButton,500);
                return;
            }
            bttn.onclick = _this._deSelectAlertBttn.bind(_this);
        }
    },

    /**
     * Actives the Alert Button in the top right corner. Fired on-click.
     * @param e
     * @private
     */
    _selectAlertBttn:function(e) {
        //Change the button state and styling to selected.
        this._alertBttnSelected = !this._alertBttnSelected;
        this.toggleClass("selected", this._alertBttnSelected, this.querySelector('.customMapBttn'));

    },

    /**
     * Deactives the Alert Button in the top right corner. Fired on-click of "stop drawing" button or when pressing esc.
     * @param e
     * @private
     */
    _deSelectAlertBttn: function(e) {
        //Change the button state and styling to de-selected.
        this._alertBttnSelected = false;
        this.toggleClass("selected", this._alertBttnSelected, this.querySelector('.customMapBttn'));
        //Revert the cursor state, clear the temporary click listener and reset the selected Alert Template id.
        if (this._selectedAlertTemplateId) {
            //Reset the cursor.
            this._map.setOptions({draggableCursor:''});
            //Remove this click-listener and clear the selected Alert Template id.
            google.maps.event.clearListeners(this._map,'click');
            this._selectedAlertTemplateId = null;
        }
    },

    /**
     * Returns the tracker label or the _id.
     * @param alertTemplate
     * @private
     */
    _getAlertTemplateName: function(alertTemplate) {
        return alertTemplate.label || alertTemplate._id;
    },

    /**
     * Fired when an Alert Template is selected.
     * @private
     */
    _selectAlertTemplate: function(e) {
        var _this = this;
        //Store the id of the selected Alert Template for later use.
        this._selectedAlertTemplateId = e.target.getAttribute('data-id');
        //Change the cursor to the icon of the Alert Template (17.5/35 offset so the click registers in the correct position)
        this._map.setOptions({draggableCursor:'url('+this.pathtoimages+'/img/alert_marker.png) 17.5 35, crosshair'});

        google.maps.event.addListener(this._map,'click',function(e) {
            //Create a new child Alert Template to be linked one-to-one with the Alert.
            _this._createChildTemplate(_this._selectedAlertTemplateId,e.latLng);
        })
    },

    /**
     *
     * @param parentAlertTemplateId
     * @param latLng
     * @private
     */
    _createChildTemplate: function(parentAlertTemplateId,latLng) {
        //Find and clone the Alert Template that we will build the child template from.
        var childTemplate = JSON.parse(JSON.stringify(this._alertTemplates.filter(function(alertTemplate) {
            return alertTemplate._id === parentAlertTemplateId;
        })[0]));
        //Update the coordinates for the anchor point and zone centers.
        childTemplate.anchor.geometry.coordinates = [latLng.lng(),latLng.lat()];
        for (var i=0; i<childTemplate.zones.features.length; i++) {
            childTemplate.zones.features[i].properties.googleMaps.center = [latLng.lat(),latLng.lng()];
        }
        //Create a new _id and add the parentAlertTemplateId to the properties.
        if (!childTemplate.properties) {
            childTemplate.properties = {};
        }
        childTemplate.properties.parentTrackerId = childTemplate._id;
        childTemplate._id = parentAlertTemplateId+'.'+new Date().getTime();
        //Now that we have updated center coordinates we need to update the coordinates for all the zones.
        this._alertTemplateData = {"alertTemplate":childTemplate,"marker":null,"circles":[],"zoneOverlays":[],"highestLats":[],"isPersisted":false};
        this._updateAlertTemplateJSON();
        //Draw the new Alert Template.
        this._drawAlertTemplate(this._alertTemplateData.alertTemplate);
        //De-activate the Alert button.
        this._deSelectAlertBttn();
    },

    /**
     * Toggles activation mode for the Alert.
     * @param e
     * @private
     */
    _toggleActivatingAlert: function(e) {
        //In case there were changes, update the child Alert Template.
        this.saveAlertTemplate();
        //Enable "Confirm New Alert" Mode.
        this._activatingAlert = true;
    },

    /**
     * Activates the current Alert.
     * @param e
     * @private
     */
    _activateAlert: function(e) {
        var _this = this;
        //Create the new Alert location.
        var location = {
            "location": {
                "geometry": { "type" : "Point", "coordinates" : this._alertTemplateData.alertTemplate.anchor.geometry.coordinates },
                "properties": {
                    "trackerId": this._alertTemplateData.alertTemplate._id,
                    "zoneNamespace": new Date().getTime()
                }
            }
        };
        voyent.locate.updateTrackerLocation({location: location}).then(function(data) {
            _this._alertTemplateData.alertInstance = location;
            _this.fire('message-info', 'New Alert Activated!');
            _this._activatingAlert = false;
            _this._alertActivated = true;
        }).catch(function (error) {
            _this.fire('message-error', 'Issue creating new Alert: ' + location.location.properties.zoneNamespace);
            console.error('Issue creating new Alert: ' + location.location.properties.zoneNamespace, error);
        });
    },

    /**
     * Handles all back functionality in the editor.
     * @param e
     * @private
     */
    _goBack: function(e) {
        if (this._activatingAlert) {
            this._activatingAlert = false;
        }
        else {
            this.removeAlertTemplate();
        }
    },

    /**
     * Cancels the entire Alert creation process and deletes and child Alert Templates that may have been created.
     * @param e
     * @private
     */
    _cancel: function(e) {
        if (this._alertBttnSelected) {
            this._deSelectAlertBttn();
        }
        else {
            this.removeAlertTemplate();
            this._addAlertButton();
            this._activatingAlert = false;
        }
    },

    /**
     * Initialize a keydown listener for canceling Alert creation.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this;
        //If the escape key is pressed then stop drawing
        //and cancel any polygons currently being drawn.
        window.addEventListener('keydown',function (event) {
            if (event.which === 27) {
                _this._deSelectAlertBttn();
            }
        });
    }
});
