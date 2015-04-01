var _qList;

Polymer({

    /**
     * Fired whenever there is a message for an action that was triggered.
     *
     * @event queryMsgUpdated
     */

    /**
     * The id of the bridgeit-query-editor component.
     *
     * @attribute for
     * @type string
     * @default null
     */
    for: null,

    /**
     * A set of styles as name:value pairs, set directly on the query list table.
     *
     * @attribute tblstyle
     * @type object
     * @default {}
     */
    tblstyle: {},

    allQueries:[],

    domReady: function() {
        _qList = this;
        if (!_qList.for) {
            _qList.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'for attribute is required'});
            return;
        }
        var editor = document.getElementById(_qList.for);
        if (editor) {
            if (editor.tagName === 'BRIDGEIT-QUERY-EDITOR') {
                editor.fetchQueryList();
                editor.addEventListener('queriesRetrieved', function(e) {
                    var res = e.detail.results;
                    if (Object.keys(res).length === 0) {
                        _qList.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'Query list is empty.'});
                        _qList.allQueries = [];
                        return;
                    }
                    _qList.allQueries = res;
                });
            }
            else {
                _qList.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'element is not bridgeit-query-editor'});
            }
        }
        else {
            _qList.fire('queryMsgUpdated',{id:_qList.id ? _qList.id : null, message: 'bridgeit-query-editor component not found'});
        }
    },
    _viewQuery: function(event,detail,sender) {
        var query = sender.templateInstance.model.query;
        var queryEditor = document.getElementById(_qList.for);
        queryEditor.setEditorFromMongo(query);
        queryEditor.runQuery();
    }
});