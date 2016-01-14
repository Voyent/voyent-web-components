Polymer({
    is: "bridgeit-recognizer-list",

    ready: function() {
        this._setupListener();
    },


    //******************PRIVATE API******************

    /**
     * Adds an event listener for the `recognizersRetrieved` event.
     */
    _setupListener: function() {
        var _this = this;
        Polymer.dom(this).parentNode.addEventListener('recognizersRetrieved', function(e) {
            _this._allRecognizers = e.detail.recognizers.length > 0 ? e.detail.recognizers : null;
        });
    },

    /**
     * Loads the selected recognizer.
     * @param e
     * @private
     */
    _loadRecognizer: function(e) {
        Polymer.dom(this).parentNode.loadRecognizer(e.model.item);
    },

    /**
     * Sorts the list of recognizers alphabetically.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortList: function(a,b) {
        a = a._id.toLowerCase();
        b = b._id.toLowerCase();
        if (a < b) { return -1; }
        else if (a > b) { return  1; }
        return 0;
    }
});