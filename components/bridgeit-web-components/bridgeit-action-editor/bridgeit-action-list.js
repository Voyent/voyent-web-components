Polymer({
    is: "bridgeit-action-list",

    ready: function() {
        this._setupListener();
    },


    //******************PRIVATE API******************

    /**
     * Adds an event listener for the `actionsRetrieved` event.
     */
    _setupListener: function() {
        var _this = this;
        Polymer.dom(this).parentNode.addEventListener('actionsRetrieved', function(e) {
            _this._allActions = e.detail.actions.length > 0 ? e.detail.actions : null;
        });
    },

    /**
     * Loads the selected action.
     * @param e
     * @private
     */
    _loadAction: function(e) {
        Polymer.dom(this).parentNode.loadAction(e.model.item);
    },

    /**
     * Sorts the list of actions alphabetically.
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