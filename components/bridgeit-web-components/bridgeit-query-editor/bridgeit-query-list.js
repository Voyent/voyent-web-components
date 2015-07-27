var _qList;

Polymer({
    is: "bridgeit-query-list",

    properties: {
        /**
         * The id of the `bridgeit-query-editor` component.
         */
        for: { type: String }
    },

    /**
     * Fired whenever there is a message for an action that was triggered. Contains the message and the message type (info, error).
     * @event queryMsgUpdated
     */

    created: function() {
        _qList = this;
    },

    ready: function() {
        _qList._allQueries = [];
        _qList.setupListener();
    },

    /**
     * Adds an event listener for the `queriesRetrieved` event. Triggered on initialization if there is a valid `for` attribute.
     */
    setupListener: function() {
        if (!_qList._validateFor()) { return; }

        var editor = document.getElementById(_qList.for);
        editor.fetchQueryList();
        editor.addEventListener('queriesRetrieved', function(e) {
            _qList._allQueries = e.detail.results;
            if (Object.keys(_qList._allQueries).length === 0) {
                _qList.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'Query list is empty.','type':'error'});
            }
        });
    },


    //******************PRIVATE API******************

    /**
     * Checks that the `for` attribute is pointing to a valid element.
     * @return {boolean} Boolean indicating if the for attribute is pointing to a valid `bridgeit-query-editor`.
     * @private
     */
    _validateFor: function() {
        if (!_qList.for) {
            _qList.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'for attribute is required','type':'error'});
            return false;
        }
        if (!document.getElementById(_qList.for) || document.getElementById(_qList.for).tagName !== 'BRIDGEIT-QUERY-EDITOR') {
            _qList.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'element cannot be found or is not a bridgeit-query-editor','type':'error'});
            return false;
        }
        return true;
    },

    /**
     * Loads the selected query into the query editor.
     * @param e
     * @private
     */
    _viewQuery: function(e) {
        var query = e.model.item;
        var queryEditor = document.getElementById(_qList.for);
        queryEditor.setEditorFromMongo(query);
        queryEditor.runQuery();
    }
});