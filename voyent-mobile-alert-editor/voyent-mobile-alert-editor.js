Polymer({
    is: 'voyent-mobile-alert-editor',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],

    properties: {
        /**
         * Indicates whether an alert is currently being fetched from database and loaded into the editor.
         */
        isAlertLoading: { type: Boolean, value: false, readOnly: true, notify: true, observer: '_isAlertLoading' },
        /**
         * Indicates whether an alert is currently loaded in the editor.
         */
        isAlertLoaded: { type: Boolean, value: false, readOnly: true, notify: true }
    },

    observers: [
        '_loadedAlertChanged(_loadedAlert)'
    ],

    /**
     * Load the passed template at the specified coordinates.
     * @param template - The template JSON to be loaded.
     * @param coordinates - The coordinates in object form {lat:{{lat}},lng:{{lng}}}. If not provided the alert will be centered on the region.
     */
    loadAlert: function(template,coordinates) {
        var _this = this;
        this._setIsAlertLoading(true);
        if (!coordinates) {
            if (!this._areaRegion) {
                this._areaRegionIsAvailable().then(function() {
                    _this.loadAlert(template,null);
                });
                return;
            }
            else {
                var center = _this._areaRegion.bounds.getCenter();
                coordinates = {"lat":center.lat(),"lng":center.lng()};
            }
        }
        //Clear the map of any loaded alert template before drawing.
        if (this._loadedAlert) {
            this.clearMap();
        }
        //Remove the parent's id from the record as we'll generate a new one.
        var id = template._id;
        delete template._id;
        //If we have a geometry then use the provided location as the alert center.
        var latLng = null;
        if (template.geo) {
            latLng = new google.maps.LatLng(coordinates);
        }
        template.state = 'draft'; //Default to draft
        //Set this flag so the center_changed listener will not fire for each circular zone that is drawn.
        this._ignoreZoneCenterChangedEvent = true;
        this._drawAndLoadAlertTemplate(template,latLng);
        this._loadedAlert.template.setParentId(id);
        this._setIsAlertLoading(false);
        //Populate the movement pane, async so the properties panel has time to initialize.
        setTimeout(function() {
            _this._ignoreZoneCenterChangedEvent = false;
        },0);
    },

    //******************PRIVATE API******************

    _onAfterLogin: function() {
        this._fetchRealmRegion();
    },

    /**
     * Listens to whether an alert is loading and toggles the flag for skipping region panning.
     * @param isAlertLoading
     * @private
     */
    _isAlertLoading: function(isAlertLoading) {
        this._skipRegionPanning = isAlertLoading;
    },

    /**
     * Listens to whether an alert is loaded and toggles the isAlertLoaded flag.
     * @param loadedAlert
     * @private
     */
    _loadedAlertChanged: function(loadedAlert) {
        this._setIsAlertLoaded(!!(loadedAlert && loadedAlert.template));
    }
});