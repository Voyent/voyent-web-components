Polymer({
    is: "bridgeit-location-simulations",

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
     * Loads the selected simulation.
     * @param e
     * @private
     */
    _loadSimulation: function(e) {
        Polymer.dom(this).parentNode.loadSimulation(e.model.item);
    }
});