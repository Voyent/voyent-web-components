Polymer({
    is: 'voyent-my-locations',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    ready: function() {
        var _this = this;
        //Type options for drop-down menus.
        this._creationTypes = ['address','pindrop'];
        this._creationType = 'address';
        //An array of MyLocations, represents the locations currently on the map (saved or not).
        this._myLocations = [];
        //The location that is currently active in the editor (infoWindow is displayed).
        this._loadedLocation = null;
        //An object containing details of the last Google Place search result (after clicking a place icon on map).
        this._selectedPlace = null;
        //Since all changes are transient before they save we have these lists
        //to flag locations that require a db call once they hit save.
        this._locationsToUpdate = [];
        this._locationsToDelete = [];
        //Setup the infoWindow.
        this._setupInfoWindow();
        //Set the button state to disabled by default
        this._buttonsEnabled = false;
        //Initialize places service for later.
            _this._placesService = new google.maps.places.PlacesService(_this._map);
        });
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function () {
        var _this = this;
        //Add the buttons to the map.
        this._addCustomControl();
        //Specify that we want to skip panning to the region boundary as
        //we'll conditionally do this in the promises callback.
        this._skipRegionPanning = true;
        //Fetch the realm region and the previously created locations. After we have them
        //both adjust the bounds based on whether we retrieved any location records.
        var promises = [];
        promises.push(this._fetchRealmRegion(true));
        promises.push(this._fetchMyLocations());
        Promise.all(promises).then(function() {
            if (_this._myLocations.length) {
                _this._adjustBounds();
            }
            else {
                _this._skipRegionPanning = false;
                _this._map.fitBounds(_this._areaRegion.bounds);
                _this._map.panToBounds(_this._areaRegion.bounds);
            }
        });

        //Add "create new location" button and remove Google's hand button.
        this._addMarkerButton(function() {
            _this._openDialog(function () {
                if (_this._creationType === 'pindrop') {
                    _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
                }
                else {
                    _this._createLocation(new google.maps.Marker({
                        position: _this._placeCoordinates,
                        map: _this._map,
                        draggable: true
                    }));
                    _this._adjustBounds();
                }
            });
        });
        this._removeStopDrawingButton();
    },

    /**
     * Triggered whenever the user clicks the save button, fires the save and
     * delete calls based on changes made since component load or last save.
     * @private
     */
    _saveChanges: function() {
        var _this = this;
        //It's possible that the user edited a location and then later decided to
        //delete it so in these cases make sure we don't bother updating it.
        for (var i=this._locationsToUpdate.length-1; i>=0; i--) {
            if (this._locationsToDelete.indexOf(this._locationsToUpdate[i]) > -1) {
                this.splice('_locationsToUpdate',i,1);
            }
        }
        //Save and delete the locations. Once all operations are done display a message indicating the results.
        var promises = [];
        promises.push(this._saveLocations());
        promises.push(this._removeLocations());
        Promise.all(promises).then(function(results) {
            _this.fire('message-info',_this._getSavedMessage(results[0],results[1]));
            //Disable the buttons as long as we didn't have any POST failures.
            if (!results[0].failures) {
                _this._buttonsEnabled = false;
            }
        });
    },

    /**
     * Triggered whenever the user clicks the cancel button, reverts all changes made since component load or last save.
     * @private
     */
    _cancelChanges: function() {
        var _this = this;
        this._fetchMyLocations().then(function() {
            _this._buttonsEnabled = false;
            _this.fire('message-info','Successfully reverted all changes.');
        });
    },

    /**
     * Saves all locations that have been modified since component load or last save.
     * @returns {Promise}
     * @private
     */
    _saveLocations: function() {
        var _this = this, myLocation;
        return new Promise(function (resolve) {
            var promises = [];
            //Loop backwards since we're splicing.
            for (var i=_this._locationsToUpdate.length-1; i>=0; i--) {
                myLocation = _this._locationsToUpdate[i];
                //Make sure we have the latest JSON before saving it.
                myLocation.updateJSON();
                (function(myLocation) {
                    promises.push(new Promise(function (resolveRequest) {
                        voyent.locate.updateLocation({account:_this.account,realm:_this.realm,
                                                      location:myLocation.json}).then(function() {
                            myLocation.isPersisted = true;
                            //Don't use i to splice because it may change as we splice out other locations.
                            _this.splice('_locationsToUpdate',_this._locationsToUpdate.indexOf(myLocation),1);
                            resolveRequest(true);
                        }).catch(function () {
                            //Don't splice the _locationsToUpdate array on failure so the
                            //request will be attempted again the next time they save.
                            resolveRequest(false);
                        });
                    }));
                })(myLocation)
            }
            //Once all the update requests are complete return the results.
            //We will resolve immediately if the promises array is empty.
            Promise.all(promises).then(function(results) {
                resolve(_this._processResults(results));
            });
        });
    },

    /**
     * Removes all locations that have been deleted since component load or last save.
     * @returns {Promise}
     * @private
     */
    _removeLocations: function() {
        var _this = this, myLocation;
        return new Promise(function (resolve) {
            var promises = [];
            //Loop backwards since we're splicing.
            for (var i=_this._locationsToDelete.length-1; i>=0; i--) {
                myLocation = _this._locationsToDelete[i];
                (function(myLocation) {
                    promises.push(new Promise(function (resolveRequest) {
                        var query = {"location.properties.vras.id":myLocation.id};
                        voyent.locate.deleteLocations({account:_this.account,realm:_this.realm,
                                                       query:query}).then(function() {
                            //Don't use i to splice because it may change as we splice out other locations.
                            _this.splice('_locationsToDelete',_this._locationsToDelete.indexOf(myLocation),1);
                            resolveRequest(true);
                        }).catch(function () {
                            //It wasn't deleted so re-add it to the map.
                            myLocation.addToMap();
                            _this._myLocations.push(myLocation);
                            _this.splice('_locationsToDelete',_this._locationsToDelete.indexOf(myLocation),1);
                            resolveRequest(false);
                        });
                    }));
                })(myLocation)
            }
            //Once all the update requests are complete return the results.
            //We will resolve immediately if the promises array is empty.
            Promise.all(promises).then(function(results) {
                resolve(_this._processResults(results));
            });
        });
    },

    /**
     * Whenever a property is edited we need to be sure to flag the associated location for updating.
     * @param myLocation
     */
    flagLocationForUpdating: function(myLocation) {
        if (this._locationsToUpdate.indexOf(myLocation) === -1) {
            this._locationsToUpdate.push(myLocation);
        }
        this._buttonsEnabled = true;
    },

    /**
     * Wrapper function for `flagLocationForUpdating`. Used by the template.
     * @private
     */
    _flagLocationForUpdating: function() {
        //This may fire when the toggle component is initializing.
        if (!this._loadedLocation) { return; }
        this.flagLocationForUpdating(this._loadedLocation);
    },

    /**
     * Triggered whenever the user clicks the trash icon in the infoWindow.
     * Removes the location from the map and flags it for deletion.
     * @private
     */
    _flagLocationForRemoval: function() {
        this._closeInfoWindow();
        this._loadedLocation.removeFromMap();
        if (this._loadedLocation.isPersisted) {
            this._locationsToDelete.push(this._loadedLocation);
            this._buttonsEnabled = true;
        }
        else {
            //If the location isn't persisted then we don't need to flag it for deletion, just
            //remove it from the map. Additionally, if no other locations have been updated
            //then we can disable the buttons again as no changes have been made.
            var locationIndex = this._locationsToUpdate.indexOf(this._loadedLocation);
            if (locationIndex > -1) {
                this._locationsToUpdate.splice(locationIndex,1);
                if (!this._locationsToDelete.length && !this._locationsToUpdate.length) {
                    this._buttonsEnabled = false;
                }
            }
        }
        var indexToRemove = this._myLocations.indexOf(this._loadedLocation);
        if (indexToRemove > -1) {
            this._myLocations.splice(indexToRemove,1);
        }
        this._loadedLocation = null;
    },

    /**
     * Returns the message to be displayed after the changes are saved.
     * @param saveResults
     * @param removalResults
     * @returns {string|*}
     * @private
     */
    _getSavedMessage: function(saveResults,removalResults) {
        var successMsg='', failureMsg='';
        if (saveResults.successes || removalResults.successes) {
            if (saveResults.successes) {
                successMsg += 'Successfully updated ' + saveResults.successes;
            }
            if (removalResults.successes) {
                successMsg += (successMsg ? ' and removed ' : 'Successfully removed ') + removalResults.successes;
            }
            successMsg += saveResults.successes > 1 || removalResults.successes > 1 ? ' locations.' : ' location.';
        }
        if (saveResults.failures || removalResults.failures) {
            if (saveResults.failures) {
                failureMsg += 'Failed to update ' + saveResults.failures;
            }
            if (removalResults.failures) {
                failureMsg += (failureMsg ? ' and remove ' : 'Failed to remove ') + removalResults.failures;
            }
            failureMsg += saveResults.failures > 1 || removalResults.failures > 1 ? ' locations.' : ' location.';
        }
        return successMsg + ' ' + failureMsg;
    },

    /**
     *
     * @param results
     * @private
     */
    _processResults: function(results) {
        var resultsObj = {"successes":0,"failures":0};
        for (var i=0; i<results.length; i++) {
            if (results[i]) { resultsObj.successes++; }
            else { resultsObj.failures++; }
        }
        return resultsObj;
    },

    /**
     * Initializes the infoWindow object and sets up associated listeners.
     * @private
     */
    _setupInfoWindow: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            //Initialize infoWindow object for later.
            _this._infoWindow = new google.maps.InfoWindow();
            //Close the infoWindow and re-display the previously hidden overlay when clicking on the map.
            google.maps.event.addListener(_this._map, 'click', function(e) {
                _this._closeInfoWindow();
                if (_this._loadedLocation) {
                    _this._loadedLocation.nameOverlay.displayAndDraw();
                }
                //If we have a placeId then it means a location of interest was clicked on the map. In this case we will
                //replace the default infoWindow with a custom one so the user can optionally add it to their locations.
                if (e.placeId) {
                    //Prevent the default info window from opening.
                    e.stop();
                    _this._loadedLocation = null;
                    _this._placesService.getDetails({placeId: e.placeId}, function(place,status) {
                        if (status === 'OK') {
                            _this._selectedPlace = _this._buildPlaceDetails(place);
                        }
                        else {
                            _this._selectedPlace = {
                                "name":'Unknown Location',
                                "latLng":e.latLng
                            };
                        }
                        _this._toggleInfoWindow(null);
                    });
                }
            });
            //When clicking the close button on the infoWindow redisplay the overlay.
            google.maps.event.addListener(_this._infoWindow,'closeclick',function() {
                _this._infoWindowOpen = false;
                if (_this._loadedLocation) {
                    _this._loadedLocation.nameOverlay.displayAndDraw();
                }
                if (_this._selectedPlace) {
                    _this._selectedPlace = null;
                }
            });
        });
    },

    /**
     * Builds the relevant place details from the Google Places search result.
     * @param place
     * @private
     */
    _buildPlaceDetails: function(place) {
        var selectedPlace = {
            "name":place.name,
            "latLng":place.geometry.location
        };
        var addressComponent;
        for (var i=0; i<place.address_components.length; i++) {
            addressComponent = place.address_components[i];
            if (addressComponent.types.indexOf('street_number') > -1) {
                selectedPlace.streetNumber = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('route') > -1) {
                selectedPlace.route = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('locality') > -1) {
                selectedPlace.locality = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('political') > -1 &&
                     addressComponent.types.indexOf('country') === -1) {
                selectedPlace.political = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('postal_code') > -1) {
                selectedPlace.postalCode = addressComponent.short_name || addressComponent.long_name;
            }
        }
        return selectedPlace;
    },

    /**
     * Displays an infoWindow that is triggered when clicking on location markers or clicking on a place icon.
     * @param myLocation
     * @private
     */
    _toggleInfoWindow: function(myLocation) {
        var _this = this;
        //If the selected infoWindow is already opened then close it.
        if (this._infoWindowOpen && myLocation === this._loadedLocation) {
            this._closeInfoWindow();
            this._loadedLocation.nameOverlay.displayAndDraw();
        }
        else {
            //Do this async so we don't get rendering flicker when opening the info window.
            setTimeout(function() {
                //Re-display any previously hidden location overlay.
                if (_this._loadedLocation) {
                    _this._loadedLocation.nameOverlay.displayAndDraw();
                }
                //If we were passed a location then select it otherwise if we
                //have a selected place then render the custom info window.
                if (myLocation) {
                    _this._loadedLocation = myLocation;
                    _this._infoWindow.open(_this._map,_this._loadedLocation.marker);
                    //Hide the current location's overlay.
                    _this._loadedLocation.nameOverlay.hide();
                }
                else if (_this._selectedPlace) {
                    _this._infoWindow.setPosition(_this._selectedPlace.latLng);
                    _this._infoWindow.open(_this._map);
                }
                else { return; }
                _this.$.infoWindow.removeAttribute('hidden');
                _this._infoWindow.setContent(_this.$.infoWindow);
                _this._infoWindowOpen = true;
            },0);
        }
    },

    /**
     * Closes the info window.
     * @private
     */
    _closeInfoWindow: function() {
        this._infoWindow.close();
        this._infoWindowOpen = false;
    },

    /**
     * Adds the map control that contains the save and cancel buttons.
     * @private
     */
    _addCustomControl: function() {
        if (this._customControlAdded) { return; }
        this.$.customControl.removeAttribute('hidden');
        this._map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(this.$.customControl);
        this._customControlAdded = true;
    },

    //The dialog functions below override the functions in the behaviour.

    /**
     * Opens the dialog for creating a new location.
     * @param confirmFunc
     * @param cancelFunc
     * @private
     */
    _openDialog: function(confirmFunc,cancelFunc) {
        this._dialogConfirmFunc = confirmFunc;
        this._dialogCancelFunc = cancelFunc;
        var dialog = this.querySelector('#modalDialog');
        if (dialog) { dialog.open(); }
    },

    /**
     * Handles dialog input validation and calling the confirmation function if available.
     * @private
     */
    _confirmDialog: function() {
        //Validate the dialog.
        if (!this._creationType || (this._creationType === 'address' && !this._placeCoordinates) ||
            !this._locationName || !this._locationName.trim()) {
            this.fire('message-error', 'Please complete all fields.');
            return;
        }
        //We allow for passing the confirm function directly or as a string.
        if (this._dialogConfirmFunc) {
            if (typeof this._dialogConfirmFunc === 'string') { this[this._dialogConfirmFunc](); }
            else { this._dialogConfirmFunc(); }
        }
        //Close the dialog after.
        this._closeDialog(true);
        if (this._creationType === 'address') {
            this._buttonsEnabled = true;
        }
    },

    /**
     * Handles closing the dialog and calling the cancel function if available.
     * @param confirmed
     * @private
     */
    _closeDialog: function(confirmed) {
        //Only call the cancel function if this is triggered by a cancel.
        //We allow passing the confirm function directly or as a string.
        if (!confirmed && this._dialogCancelFunc) {
            if (typeof this._dialogCancelFunc === 'string') { this[this._dialogCancelFunc](); }
            else { this._dialogCancelFunc(); }
        }
        this._dialogConfirmFunc = this._dialogCancelFunc = null;
        this.querySelector('#modalDialog').close();
    },

    /**
     * Initialize the listeners for drawing a new location on the map.
     * @private
     */
    _setupDrawingListeners: function () {
        var _this = this;
        google.maps.event.addListener(this._drawingManager, 'markercomplete', function (marker) {
            //Draw the location marker and exit drawing mode.
            _this._createLocation(marker);
            _this._drawingManager.setDrawingMode(null);
            _this._buttonsEnabled = true;
            _this._adjustBounds();
        });
        //When the escape key is pressed exit drawing mode.
        window.addEventListener('keydown', function (event) {
            if (event.which === 27) {
                if (_this._drawingManager.getDrawingMode() !== null) {
                    _this._drawingManager.setDrawingMode(null);
                }
            }
        });
    },

    /**
     * Adds the last selected Google Place to the map as a new location.
     * @private
     */
    _addPlaceToMyLocations: function() {
        if (!this._selectedPlace) { return; }
        this._loadedLocation = this._createLocation(new google.maps.Marker({
            map: this._map,
            position: this._selectedPlace.latLng,
            draggable: true
        }));
     * Removes Google's "Stop drawing" hand button from the top-right corner.
     * @private
     */
    _removeStopDrawingButton: function() {
        if (!this._stopDrawingButtonRemoved) {
            var _this = this;
            function waitForStopDrawingButton() {
                var stopDrawingButton = document.querySelector('div[title="Stop drawing"');
                if (!stopDrawingButton) {
                    setTimeout(waitForStopDrawingButton, 10);
                    return;
                }
                stopDrawingButton.parentNode.removeChild(stopDrawingButton);
                _this._stopDrawingButtonRemoved = true;
            }
            waitForStopDrawingButton();
        }
    },

    /**
     * @param marker
     * @private
     */
    _createLocation: function(marker) {
        //Build the new location.
        this._myLocations.push(newLocation);
        this._locationsToUpdate.push(newLocation);
        //Reset the dialog properties.
        this._isPrivateResidence = false;
        this._locationName = null;
        var autocomplete = this.$$('#autoComplete');
        if (autocomplete) {
            autocomplete.value = '';
        }
    },

    /**
     * Initialize the places autoComplete.
     * @private
     */
    _setupAutoComplete: function() {
        if (this._autoComplete) { return; }
        var _this = this, place;
        var autocompleteInput = this.$$('#autoComplete').querySelector('input');
        autocompleteInput.setAttribute('placeholder','Enter an address');
        //Wait until we have the area region so we can favour results from within that region.
        function waitForAreaRegion() {
            if (!_this._areaRegion) {
                setTimeout(waitForAreaRegion,50);
                return;
            }
            _this._autoComplete = new google.maps.places.Autocomplete(autocompleteInput, {
                "bounds":_this._areaRegion.bounds, "strictBounds":false
            });
            google.maps.event.addListener(_this._autoComplete, 'place_changed', function() {
                place = _this._autoComplete.getPlace();
                if (place && place.geometry && place.geometry.location) {
                    _this._placeCoordinates = place.geometry.location;
                    _this._locationName = place.name;
                }
                else if (!place || Object.keys(place).length === 1) {
                    _this._placeCoordinates = null;
                    _this._locationName = null;
                }
            });
        }
        waitForAreaRegion();
    },

    /**
     * Adjust the bounds of the map so all locations are in view.
     * @private
     */
    _adjustBounds: function() {
        //Temporary set the maxZoom so the map doesn't zoom in too far when panning.
        this._map.setOptions({maxZoom:17});
        var bounds = new google.maps.LatLngBounds();
        for (var i=0; i<this._myLocations.length; i++) {
            bounds.extend(this._myLocations[i].marker.getPosition());
        }
        this._map.fitBounds(bounds);
        this._map.panToBounds(bounds);
        this._map.setOptions({maxZoom:null});
    },

    /**
     * Returns whether the passed creationType is of the address type.
     * @param creationType
     * @private
     */
    _isAddress: function(creationType) {
        var _this = this;
        var isAddress = creationType === 'address';
        //Make sure we initialize the autoComplete, async is required to allow it time to render.
        if (isAddress) {
            setTimeout(function() {
                _this._setupAutoComplete();
            },0);
        }
        return isAddress;
    },

    /**
     * Proper-case the passed type.
     * @param type
     * @returns {string}
     * @private
     */
    _returnCreateTypeLabel: function(type) {
        return type === 'pindrop' ? 'Pin Drop' : 'Address';
    }
});