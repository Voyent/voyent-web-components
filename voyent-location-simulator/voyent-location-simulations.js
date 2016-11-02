Polymer({
    is: "voyent-location-simulations",

    properties: {
        /**
         * Selected index of the saved simulations dropdown
         */
        _selectedIndex: { type: Number, observer: '_selectedIndexChanged' }
    },

    ready: function() {
        this._setupListener();
    },


    //******************PRIVATE API******************

    /**
     * Adds an event listener for the `simulationsRetrieved` event.
     */
    _setupListener: function() {
        var _this = this;
        Polymer.dom(this).parentNode.addEventListener('simulationsRetrieved', function(e) {
            _this._allSimulations = e.detail.simulations.length > 0 ? e.detail.simulations : null;
        });
    },

    /**
     * Fired when the selectedIndex changes
     * If we have a valid new index we try to load it
     */
    _selectedIndexChanged: function() {
        if (typeof this._selectedIndex !== 'undefined' && this._selectedIndex !== null) {
            Polymer.dom(this).parentNode.loadSimulation(this._allSimulations[this._selectedIndex]);
        }
    }
});