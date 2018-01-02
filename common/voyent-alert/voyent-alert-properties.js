Polymer({
    is: "voyent-alert-properties",
    behaviors: [Voyent.AlertBehaviour],

    properties: {
        /**
         * Indicates whether the movement accordion will be shown.
         */
        showMovementAccordion: { type: Boolean, value: false },
        /**
         * Indicates whether the alert name at the top of the panel should be hidden.
         */
        hideAlertName: { type: Boolean, value: false },
        /**
         * Indicates whether the alert badge chooser at the top of the panel should be hidden.
         */
        hideBadgeChooser: { type: Boolean, value: false },
        /**
         * Contains currently loaded _AlertTemplate object and the currently selected stack.
         * eg. { template:_AlertTemplate, selectedStack:_AlertZoneStack }
         */
        _loadedAlert: { type: Object, value: null, notify: true },
        /**
         * A container of data associated with the realm region boundary.
         */
        _areaRegion: { type: Object, value: null, notify: true },
        /**
         * A google maps data feature that represents the fallback (whole world) region.
         */
        _fallbackZone: { type: Object, value: null, notify: true },
        /**
         * The modal dialog message.
         */
        _dialogMessage: { type: String, value: '', notify: true },
        /**
         * Whether to show the modal dialog alert badge chooser.
         */
        _showDialogBadge: { type: Boolean, value: false, notify: true },
        /**
         * Whether to show the modal dialog input in the dialog message.
         */
        _showDialogInput: { type: Boolean, value: false, notify: true },
        /**
         * The value of the modal dialog input, if applicable.
         */
        _dialogInput: { type: String, value: '', notify: true },
        /**
         * Whether to show the modal dialog toggle button in the dialog message.
         */
        _showDialogToggle: { type: Boolean, value: false, notify: true },
        /**
         *
         * The value of the modal dialog toggle button, if applicable.
         */
        _dialogToggle: { type: Boolean, value: false, notify: true },
        /**
         * The value of the modal dialog toggle button label, if applicable.
         */
        _dialogToggleLabel: { type: String, value: '', notify: true },
        /**
         * The value of the modal dialog alert badge chooser, if applicable.
         */
        _dialogBadge: { type: String, value: '', notify: true },
        /**
         * The function called on modal dialog confirmation.
         */
        _dialogConfirmFunc: { type: Object, value: null, notify: true },
        /**
         * The function called on modal dialog cancellation.
         */
        _dialogCancelFunc: { type: Object, value: null, notify: true },
        /**
         * The direction of movement in degrees, only valid for alerts.
         */
        _alertDirection: { type: Number, value: null, notify: true },
        /**
         * The speed of movement in kph or mph, only valid for alerts.
         */
        _alertSpeed: { type: Number, value: null, notify: true },
        /**
         * The unit of movement speed, only valid for alerts.
         */
        _alertSpeedUnit: { type: String, value: null, notify: true },
        /**
         * Whether the movement accordion should be open, only valid for alerts.
         */
        _showMovement: { type: Boolean, value: false, notify: true },
        /**
         * Whether the alert badge accordion should be open.
         */
        _showBadge: { type: Boolean, value: false, notify: true}
    },

    observers: [
        '_alertDirectionChanged(_alertDirection)'
    ],

    ready: function() {
        var _this = this;
        //JsColor uses a non-standard way of handling custom events so we must setup this listener on the window object.
        window._jsColorFineChange = function(colorPicker) {
            //Determine whether we have a regular zone or the fallback zone. If we have an index
            //it means the zone is part of the stack, otherwise it's the fallback zone.
            var zone = (colorPicker.targetElement.getAttribute('data-index') ?
                _this._loadedAlert.selectedStack.getZoneAt(colorPicker.targetElement.getAttribute('data-index')) :
                _this._fallbackZone);
            if (zone) {
                zone.setColour(colorPicker.toHEXString().slice(1));
            }
        };
        //Initialize various flags.
        this._renamingTemplate = false;
        this._loadPointerLockAPI();
        //Initialize movement variables.
        this._alertSpeedUnit = 'kph';
        this._alertCardinalDirection = null;
        this._alertCardinalDirections = [
            {"label":"N","value":0},
            {"label":"NNE","value":22.5},
            {"label":"NE","value":45},
            {"label":"ENE","value":67.5},
            {"label":"E","value":90},
            {"label":"ESE","value":112.5},
            {"label":"SE","value":135},
            {"label":"SSE","value":157.5},
            {"label":"S","value":180},
            {"label":"SSW","value":202.5},
            {"label":"SW","value":225},
            {"label":"WSW","value":247.5},
            {"label":"W","value":270},
            {"label":"WNW","value":292.5},
            {"label":"NW","value":315},
            {"label":"NNW","value":337.5}
        ];
    },

    /**
     * Toggles renaming mode for an alert template.
     * @private
     */
    _toggleAlertTemplateRenaming: function() {
        var _this = this;
        this.set('_renamingTemplate',!this._renamingTemplate);
        if (this._renamingTemplate) {
            //Set the input to our current name value. We use a separate value for the input so we can easily revert.
            this.set('_templateNameVal',this._loadedAlert.template.name);
            //Focus on the input.
            setTimeout(function() {
                _this.querySelector('#alertTemplate').focus();
            },0);
        }
    },

    /**
     * Confirms or cancels the renaming of an alert template via enter and esc keys.
     * @param e
     * @private
     */
    _renameAlertTemplateViaKeydown: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        if (e.which === 13) { //Enter
            this._renameAlertTemplate();
        }
        else if (e.which === 27) { //Esc
            this._toggleAlertTemplateRenaming();
        }
    },

    /**
     * Confirms changes made to the alert template name when losing focus on the input.
     * @param e
     * @private
     */
    _renameAlertTemplateViaBlur: function(e) {
        var _this = this;
        //Always execute this function async so we can correctly determine the activeElement.
        setTimeout(function() {
            //Check if we are focused on an iron-input because if we are it means focus is still on the input so we
            //won't exit editing mode. Additionally we'll check if we are in editing mode because if we are not
            //then it means that focus was removed via the Enter or Esc key press and not just a regular blur.
            if (document.activeElement.getAttribute('is') === 'iron-input' ||
                !_this._renamingTemplate) {
                return;
            }
            _this._renameAlertTemplate();
        },0);
    },

    /**
     * Confirms the renaming of an alert template.
     * @private
     */
    _renameAlertTemplate: function() {
        if (this._templateNameVal.trim() &&
            this._templateNameVal !== this._loadedAlert.template.name) {
            this._loadedAlert.template.setName(this._templateNameVal);
            this.set('_templateNameVal','');
            this.fire('voyent-alert-template-name-changed', {"name": this._loadedAlert.template.name});
            //Toggle renaming mode.
            this._toggleAlertTemplateRenaming();
        }
    },

    /**
     * Toggles renaming mode for Proximity Zones.
     * @param eOrI - The event from the ui or the index from the JS.
     * @private
     */
    _toggleProximityZoneRenaming: function(eOrI) {
        //Prevent the event from bubbling.
        if (eOrI.stopPropagation) { eOrI.stopPropagation(); }
        var _this = this;
        //Determine whether we have a regular zone or the fallback zone. If we have a an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var i, zone;
        if ((eOrI.model && typeof eOrI.model.get('index') !== 'undefined') || typeof eOrI === 'number') {
            i = (typeof eOrI === 'number' ? eOrI : eOrI.model.get('index'));
            zone = this._loadedAlert.selectedStack.getZoneAt(i);
        }
        else {
            i = 'fallback';
            zone = this._fallbackZone;
        }
        zone.setRenaming(!zone.renaming);
        if (zone.renaming) {
            //Set the input to our current name value. We use a separate value for the input so we can easily revert.
            this.set('_zoneNameVal',zone.name);
            //Focus on the input.
            setTimeout(function() {
                _this.querySelector('#zone-'+i).focus();
            },0);
        }
        else {
            //Always reset the input value so it updates each time editing mode is entered
            this.set('_zoneNameVal','');
        }
    },

    /**
     * Confirms or cancels the renaming of a Proximity Zone via enter and esc keys.
     * @param e
     * @private
     */
    _renameProximityZoneViaKeydown: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        if (e.which === 13) { //Enter
            this._renameProximityZone(e);
        }
        else if (e.which === 27) { //Esc
            this._toggleProximityZoneRenaming(e);
        }
    },

    /**
     * Confirms changes made to the Proximity Zone name when losing focus on the input.
     * @param e
     * @private
     */
    _renameProximityZoneViaBlur: function(e) {
        var _this = this;
        //Determine whether we have a regular zone or the fallback zone. If we have an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var zone = (e.model && typeof e.model.get('index') !== 'undefined' ?
                    this._loadedAlert.selectedStack.getZoneAt(e.model.get('index')) :
                    this._fallbackZone);
        //Always execute this function async so we can correctly determine the activeElement.
        setTimeout(function() {
            //Check if we are focused on an iron-input because if we are it means focus is still on the input so we
            //won't exit editing mode. Additionally we'll check if we are in editing mode because if we are not
            //then it means that focus was removed via the Enter or Esc key press and not just a regular blur.
            if (document.activeElement.getAttribute('is') === 'iron-input' ||
                  !zone.renaming) {
                return;
            }
            _this._renameProximityZone(e);
        },0);
    },

    /**
     * Confirms the renaming of a Proximity Zone.
     * @param e
     * @private
     */
    _renameProximityZone: function(e) {
        //Determine whether we have a regular zone or the fallback zone. If we have an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var i, zone;
        if (e.model && typeof e.model.get('index') !== 'undefined') {
            i = e.model.get('index');
            zone = this._loadedAlert.selectedStack.getZoneAt(i);
        }
        else {
            i = 'fallbackZone';
            zone = this._fallbackZone;
        }
        if (this._zoneNameVal.trim() && this._zoneNameVal !== zone.name) {
            zone.setName(this._zoneNameVal);
            this.set('_zoneNameVal','');
            this.fire('voyent-alert-zone-name-changed',{
                "id":zone.id,
                "name":zone.name,
                "isFallbackZone":i === 'fallbackZone'
            });
            //Redraw the overlay since the content changed.
            zone.nameOverlay.draw();
            //Toggle renaming mode.
            this._toggleProximityZoneRenaming(i);
        }
    },
    
    chooseAlertBadge: function() {
        var _this = this;
        this._openDialog(null,null,null,true,function() {
            // Persist our choice to the template JSON
            _this._loadedAlert.template.setBadge(this._dialogBadge);
            
            // Fire an event that the badge changed
            _this.fire('voyent-alert-badge-changed', {"badge": _this._loadedAlert.template.badge});
            
            // If we only have a single zone stack, then update the map marker as well
            if (_this._loadedAlert.template.zoneStacks.length === 1) {
                var image = {
                    url: _this.getBadgeUrl(_this._loadedAlert.template.badge),
                    scaledSize: new google.maps.Size(32,32)
                };
                _this._loadedAlert.template.zoneStacks[0].marker.setIcon(image);
            }
        });
    },

    /**
     * Adds a new proximity zone to the alert template. The new zone is 50% larger than the largest existing zone.
     * @private
     */
    _addProximityZone: function() {
        var _this = this;
        this._openDialog('Please enter the zone name','',null,false,function() {
            var newZone;
            //Set the new zone radius as 50% larger than the current largest zone
            //and de-increment the new zone zIndex so it sits behind the other zones.
            var largestZone = _this._loadedAlert.selectedStack.getLargestZone();
            var zIndex = largestZone.zIndex - 1;
            var name = this._dialogInput;
            //Since we don't support mix and match zone types within a stack just
            //check what the first one is to determine which kind we want to add.
            if (_this._loadedAlert.selectedStack.getZoneAt(0).getShape() === 'circle') {
                var radius = this._adjustRadiusByPercentage(largestZone.shapeOverlay.getRadius(),50);
                newZone = new _this._CircularAlertZone(null,radius,name,null,null,null,null,zIndex);
            }
            else { //polygon
                var paths = this._adjustPathsByPercentage(largestZone.shapeOverlay.getPaths(),50,this._havePointerLock);
                //When we add a new zone we don't want to include the full shape so we can
                //punch it out properly later so just pass the filled outer shape via paths[0].
                newZone = new _this._PolygonalAlertZone(null,[paths[0]],name,null,null,null,null,zIndex);
            }
            _this._loadedAlert.selectedStack.addZone(newZone);
            //Re-adjust the centroid for the template.
            _this._loadedAlert.template.updateJSONAndCentroid();
            //Re-punch out the fallback zone.
            if (_this._fallbackZone) {
                _this._fallbackZone.punchOutOverlay();
            }
            _this.fire('voyent-alert-zone-added',{
                "id":newZone.id,"zone":newZone,
                "stack":_this._loadedAlert.selectedStack,
                "isFallbackZone":false
            });
            //Show the properties pane for the new zone.
            _this._toggleProperties(_this._loadedAlert.selectedStack.zones.length-1);
        });
    },

    /**
     * Removes the proximity zone from the alert template.
     * @private
     */
    _removeProximityZone: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        var zone = this._loadedAlert.selectedStack.getZoneAt(e.model.get('index'));
        var id = zone.id;
        if (this._loadedAlert.selectedStack.zones.length === 1) {
            this._loadedAlert.template.removeZoneStack(this._loadedAlert.selectedStack);
            if (this._fallbackZone) {
                this._fallbackZone.punchOutOverlay();
            }
        }
        else {
            var isLargestZone = this._loadedAlert.selectedStack.getLargestZone() === zone;
            this._loadedAlert.selectedStack.removeZone(zone);
            if (this._fallbackZone && isLargestZone) {
                this._fallbackZone.punchOutOverlay();
            }
        }
        this.fire('voyent-alert-zone-removed',{"id":id,"isFallbackZone":false});
    },

    /**
     * Removes the fallback zone entirely.
     * @private
     */
    _removeFallbackZone: function() {
        this._fallbackZone.removeFromMap();
    },

    /**
     * Confirms or cancels the edit of a Proximity Zone property via enter and esc keys.
     * @param e
     * @private
     */
    _editPropertyViaKeydown: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        if (e.which === 13 || e.which === 27) { //Enter & Escape.
            this._editProperty(e);
            //Close the colour picker.
            if (e.target.getAttribute('data-property') === 'colour') {
                var index = e.model.get('index');
                //If we have a z-index it means the zone is part of the stack, otherwise it's the fallback zone.
                var jsColorId = '#jsColor-'+ (typeof index !== 'undefined' ? index : 'fallbackZone');
                var colorPicker = this.querySelector(jsColorId);
                if (colorPicker) {
                    colorPicker.jscolor.hide();
                }
            }
        }
    },

    /**
     * Confirms the edit of a Proximity Zone property.
     * @param e
     * @private
     */
    _editProperty: function(e) {
        //If we have a z-index it means the zone is part of the stack, otherwise it's the fallback zone.
        var zone = typeof e.model.get('index') !== 'undefined' ?
            this._loadedAlert.selectedStack.getZoneAt(e.model.get('index')) :
            this._fallbackZone;
        //The properties are set directly into the properties since they are bound
        //in the template but to apply the changes we need to call our set functions.
        if (e.target.getAttribute('data-property') === 'colour') {
            zone.setColour(zone.colour);
        }
        else if (e.target.getAttribute('data-property') === 'opacity') {
            zone.setOpacity(zone.opacity);
        }
    },


    /**
     * Checks if the browser has support for the Pointer Lock API, saves a reference to the browser
     * specific implementations of the relevant functions and sets up any required listeners.
     * @private
     */
    _loadPointerLockAPI: function() {
        this._isPointerLocked = false;
        //Check if the API is available.
        this._havePointerLock = 'pointerLockElement' in document ||
                                'mozPointerLockElement' in document ||
                                'webkitPointerLockElement' in document;
        if (!this._havePointerLock) { return; }
        this._bindPointerLockListeners();
        //Initialize our enable and disable functions using the specific browser prefixes.
        this._requestPointerLock = this.requestPointerLock ||
                                   this.mozRequestPointerLock ||
                                   this.webkitRequestPointerLock;
        document.exitPointerLock = document.exitPointerLock ||
                                document.mozExitPointerLock ||
                                document.webkitExitPointerLock;
        //Hook pointer lock state change events.
        document.addEventListener('pointerlockchange', this._boundPointerLockChangeListener, false);
        document.addEventListener('mozpointerlockchange', this._boundPointerLockChangeListener, false);
        document.addEventListener('webkitpointerlockchange', this._boundPointerLockChangeListener, false);

    },

    /**
     * Listens for changes to pointer lock state and manages associated listeners.
     * @private
     */
    _pointerLockChangeListener: function() {
        if (document.pointerLockElement === this ||
            document.mozPointerLockElement === this ||
            document.webkitPointerLockElement === this) {
            //Reset our mousemove related vars.
            this._y = 0;
            this._previousY = -1;
            //Pointer was just locked, enable the mousemove and click listeners.
            this._isPointerLocked = true;
            this.addEventListener("mousemove", this._boundMouseMoveListener, false);
            this.addEventListener("click", this._boundMouseClickListener, false);
        }
        else {
            //Pointer was just unlocked, disable the mousemove and click listeners.
            this._isPointerLocked = false;
            this.removeEventListener("mousemove", this._boundMouseMoveListener, false);
            this.removeEventListener("click", this._boundMouseClickListener, false);
        }
    },

    /**
     * Listens for mouse movements while the pointer is locked. Handles adjusting the size of the zones.
     * @param e
     * @private
     */
    _mouseMoveListener: function(e) {
        this._y += (e.movementY || e.mozMovementY || e.webkitMovementY || 0);
        //Prevent the user from modifying the size of the shape so it extends into other zones in the stacks.
        //For circles we will just compare the radius but for polygons we will compare the areas and
        //then check for any intersections since the polygons in a stack can all be different shapes.
        var innerZone = this._loadedAlert.selectedStack.getZoneAt(this._loadedAlert.selectedStack.getZoneIndex(this._zoneToAdjust)-1);
        var outerZone = this._loadedAlert.selectedStack.getZoneAt(this._loadedAlert.selectedStack.getZoneIndex(this._zoneToAdjust)+1);
        var newRadius, newPath, intersects, percentage=2;
        if (this._y <= this._previousY) {
            if (this._zoneToAdjust.getShape() === 'circle') {
                newRadius = this._adjustRadiusByPercentage(this._zoneToAdjust.shapeOverlay.getRadius(),percentage);
                if (outerZone && newRadius >= outerZone.shapeOverlay.getRadius()) {
                    this.fire('message-error',this._OVERLAP_MSG);
                    this._y = this._previousY;
                    return;
                }
                this._zoneToAdjust.setRadius(newRadius);
            }
            else {
                newPath = this._adjustPathsByPercentage(this._zoneToAdjust.shapeOverlay.getPaths(),percentage,true)[0];
                if (outerZone) {
                    var outerZonePath = outerZone.shapeOverlay.getPaths().getAt(0);
                    if (google.maps.geometry.spherical.computeArea(newPath) >=
                        google.maps.geometry.spherical.computeArea(outerZonePath)) {
                        this.fire('message-error',this._OVERLAP_MSG);
                        this._y = this._previousY;
                        return;
                    }
                    else {
                        intersects = turf.lineIntersect({
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([new google.maps.MVCArray(newPath)])
                                    )[0]
                                }
                            },
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([outerZonePath])
                                    )[0]
                                }
                            });
                        if (intersects.features.length) {
                            this.fire('message-error',this._OVERLAP_MSG);
                            this._y = this._previousY;
                            return;
                        }
                    }
                }
                this._zoneToAdjust.setPaths([newPath]);
            }
        }
        else if (this._y > this._previousY) {
            if (this._zoneToAdjust.getShape() === 'circle') {
                newRadius = this._adjustRadiusByPercentage(this._zoneToAdjust.shapeOverlay.getRadius(),-percentage);
                if (innerZone && newRadius <= innerZone.shapeOverlay.getRadius()) {
                    this.fire('message-error',this._OVERLAP_MSG);
                    this._y = this._previousY;
                    return;
                }
                this._zoneToAdjust.setRadius(newRadius);
            }
            else {
                newPath = this._adjustPathsByPercentage(this._zoneToAdjust.shapeOverlay.getPaths(),-percentage,true)[0];
                if (innerZone) {
                    var innerZonePath = innerZone.shapeOverlay.getPaths().getAt(0);
                    if (google.maps.geometry.spherical.computeArea(newPath) <=
                        google.maps.geometry.spherical.computeArea(innerZonePath)) {
                        this.fire('message-error',this._OVERLAP_MSG);
                        this._y = this._previousY;
                        return;
                    }
                    else {
                        intersects = turf.lineIntersect({
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([new google.maps.MVCArray(newPath)])
                                    )[0]
                                }
                            },
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([innerZonePath])
                                    )[0]
                                }
                            });
                        if (intersects.features.length) {
                            this.fire('message-error',this._OVERLAP_MSG);
                            this._y = this._previousY;
                            return;
                        }
                    }
                }
                this._zoneToAdjust.setPaths([newPath]);
            }
        }
        //No failures so we'll adjust our markers and do the necessary punch outs.
        //For circles this occurs automatically in the `radius_changed` listener.
        if (this._zoneToAdjust.getShape() === 'polygon') {
            this._loadedAlert.selectedStack.updateJSONAndCentroid();
            this._loadedAlert.selectedStack.punchOutShapes();
            this._loadedAlert.selectedStack.initializePolygonPathListeners(this._zoneToAdjust);
            this._loadedAlert.template.updateJSONAndCentroid();
            if (this._fallbackZone) {
                this._fallbackZone.punchOutOverlay();
            }
        }
        this._previousY = this._y;
    },

    /**
     * Listens for mouse clicks while the pointer is locked and exits pointer lock mode when encountered.
     * @param e
     * @private
     */
    _mouseClickListener: function(e) {
        document.exitPointerLock();
    },

    /**
     * Binds various pointer lock related listeners so we can maintain a single reference to them and correct `this` scope.
     * @private
     */
    _bindPointerLockListeners: function() {
        if (!this._boundPointerLockChangeListener) {
            this._boundPointerLockChangeListener = this._pointerLockChangeListener.bind(this);
        }
        if (!this._boundMouseMoveListener) {
            this._boundMouseMoveListener = this._mouseMoveListener.bind(this);
        }
        if (!this._boundMouseClickListener) {
            this._boundMouseClickListener = this._mouseClickListener.bind(this);
        }
    },

    /**
     * Adjusts the passed radius to be smaller or larger based on the passed percentage.
     * @param radius
     * @param percentage
     * @returns {*}
     * @private
     */
    _adjustRadiusByPercentage: function(radius,percentage) {
        percentage = percentage / 100;
        return radius + radius * percentage;
    },

    /**
     * Adjusts the size of the passed polygon paths to be smaller or larger based on the passed percentage.
     * @param paths
     * @param percentage
     * @param useOuterZoneOnly
     * @returns {Array}
     * @private
     */
    _adjustPathsByPercentage: function(paths,percentage,useOuterZoneOnly) {
        percentage = percentage / 100;
        var distance, bearing, newPaths = [], newPath;
        var centroid = this._AlertTemplate.calculateCentroidFromPaths(paths);
        var limit = useOuterZoneOnly ? 1 : paths.length;
        for (var i=0; i<limit; i++) {
            newPath=[];
            for (var j=0; j<paths.getAt(i).length; j++) {
                //Calculate the distance and bearing from the center to each point.
                distance = google.maps.geometry.spherical.computeDistanceBetween(centroid,paths.getAt(i).getAt(j));
                bearing = google.maps.geometry.spherical.computeHeading(centroid,paths.getAt(i).getAt(j));
                //Increase the distance by the percentage to increase or decrease the area of the polygon the same.
                distance += distance * percentage;
                //Calculate the new coordinate.
                newPath.push(google.maps.geometry.spherical.computeOffset(centroid,distance,bearing));
            }
            newPaths.push(newPath);
        }
        return newPaths;
    },

    /**
     * Enables pointer lock so the user can adjust the size of the zone.
     * @private
     */
    _adjustZoneSize: function(e) {
        this._zoneToAdjust = this._loadedAlert.selectedStack.getZoneAt(e.model.get('index'));
        this._requestPointerLock();
    },

    /**
     * Triggered as the user is dragging the opacity slider.
     * @param e
     * @private
     */
    _immediateValueChange: function(e) {
        //Determine whether we have a regular zone or the fallback zone. If we have an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var zone = (e.model && typeof e.model.get('index') !== 'undefined' ?
            this._loadedAlert.selectedStack.getZoneAt(e.model.get('index')) :
            this._fallbackZone);
        if (zone) {
            if (e.target.getAttribute('data-property') === 'opacity') {
                zone.setOpacity(this._immediateValueOpacity);
            }
        }
    },

    /**
     * Validates the alert movement direction value and handles updating the template JSON.
     * @private
     */
    _alertDirectionChanged: function() {
        if (!this._alertDirection && this._alertDirection !== 0) {
            //When we have no alert direction reset the cardinal direction dropdown.
            var dropdown =  this.querySelector('#alertCardinalDirection');
            if (dropdown) {
                dropdown.selected = null;
            }
            return;
        }
        else if (this._alertDirection > 360) { //Force 360 max.
            this._alertDirection = 360;
            return;
        }
        //If the direction was typed in manually then determine whether
        //we should select a cardinal direction in the dropdown.
        if (!this._alertDirectionSetFromCardinal) {
            for (var i=0; i<this._alertCardinalDirections.length; i++) {
                if (Number(this._alertDirection) === this._alertCardinalDirections[i].value) {
                    this.set('_alertCardinalDirection', this._alertCardinalDirections[i].value);
                    return;
                }
            }
            this.set('_alertCardinalDirection', null);
        }
        this._alertDirectionSetFromCardinal = false;
    },

    /**
     * Sets the direction input after selecting an item from the cardinal direction dropdown.
     * @private
     */
    _alertCardinalDirectionChanged: function() {
        var _this = this;
        //Since this fires on iron-activate we need to process it async so the value is current.
        setTimeout(function() {
            if (_this._alertCardinalDirection || _this._alertCardinalDirection === 0) {
                _this._alertDirectionSetFromCardinal = true;
                _this.set('_alertDirection',_this._alertCardinalDirection);
            }
        },0);
    },

    /**
     * Returns the style classes for the accordion header and body elements.
     * @param section
     * @param active
     * @returns {string}
     * @private
     */
    _getAccordionClasses: function(section,active) {
        return active ? (section+' active') : section;
    },

    /**
     * Returns the style classes for the accordion zone label.
     * @param active
     * @returns {string}
     * @private
     */
    _getZoneTitleClasses: function(active) {
        return active ? 'title zone active' : 'title zone';
    },

    /**
     * Returns the arrow icon to use for each accordion.
     * @param active
     * @returns {string}
     * @private
     */
    _getArrowIcon: function(active) {
        return active ? 'expand-more' : 'expand-less';
    }
});