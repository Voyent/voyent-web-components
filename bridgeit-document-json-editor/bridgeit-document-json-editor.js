(function() {
  'use strict';

  Polymer({
    is: 'bridgeit-document-json-editor',
    behaviors: [BridgeItCommonPropertiesBehavior],

    ready: function(){
      
    },

    properties: {
      
      collection: {
        notify: true,
        type: String,
        value: 'documents',
        reflectToAttribute: true
      },
      documentId: {
        notify: true,
        type: String,
        observer: "_updateNewDocumentId"
      },
      document: {
        notify: true,
        type: Object,
        observer: "_updateNewDocument"
      },
      serializedDocument: {
        notify: true,
        type: String
      },
      attrToEdit: {
        notify: true,
        type: String
      },
      _codeMirror: {
        type: Object
      },
      editedDocumentIsValid: {
        type: Boolean,
        computed: '_computeEditedDocumentIsValid(serializedDocument)'
      },
      message: {
        type: String,
        notify: true
      }
    },

    observers: [
      '_attributesChanged(attrToEdit)'
    ],

    listeners: {
      
    },

    _updateEditor: function(){
      
      console.log('_updateEditor()');
      var _this = this;
      if( this.document ){
        var documentToDisplay;
        //if an attribute to display is set and exists
        if( this.attrToEdit && this.attrToEdit in this.document ){
          documentToDisplay = this.document[this.attrToEdit];
        }
        else{
          documentToDisplay = this.document;
        }
        if( typeof documentToDisplay === 'object'){
          this.serializedDocument = JSON.stringify(documentToDisplay, undefined, 4);
        }
        else{
          this.serializedDocument = documentToDisplay;
        }
      }
      else{
        this.serializedDocument = '{}';
      }
      setTimeout(function(){
        var container = document.querySelector(".document-editor-container");
        if( !container ){
          console.log('bridgeit-document-json-editor could not find editor container');
        }
        else{
           if( !_this._codeMirror ){
            _this._codeMirror = CodeMirror.fromTextArea(document.querySelector(".document-editor-container"),{
              value: _this.serializedDocument,
              mode:  {name: "javascript", json: true, statementIndent: 4},
              lineNumbers: true,
              lineWrapping: true,
              foldGutter: true,
              lint: true,
              gutters: ["CodeMirror-lint-markers"],
            });
            _this._codeMirror.on('change', function(editor, changeObj){
              _this.message = '';
              _this.serializedDocument = editor.getValue();
            });
          }
          else{
            _this._codeMirror.setOption('value', _this.serializedDocument);
          }
        }
        
      },200);
      
    },

    _updateNewDocumentId: function(){
      console.log('_updateNewDocumentId()');
      if( this.documentId ){
        var _this = this;
        bridgeit.io.documents.getDocument({id: this.documentId}).then(function(doc){
          _this.document = doc;
        });
      }
      else{
        this.document = null;
        this.content = null;
      }
      
    },

    _updateNewDocument: function(){
      console.log('_updateNewDocument()');
      var _this = this;
      this.documentId = this.document ? this.document._id : null;
      this._updateEditor();      
    },

    _attributesChanged: function(attrToEdit){
      this._updateEditor();
    },

    _computeEditedDocumentIsValid: function(serializedDocument){
      try{
        JSON.parse(serializedDocument);
        return true;
      }
      catch(e){
        return false;
      }
    },

    saveDocument: function(){
      var _this = this;
      try{
        var documentFragment = JSON.parse(this.serializedDocument);
        if( this.attrToEdit ){
          this.document[this.attrToEdit] = documentFragment;
        }
        else{
          this.document = documentFragment;
        }
        bridgeit.io.documents.updateDocument({id: this.documentId, document: this.document}).then(function(){
          _this.message = 'Successfully updated the document.';
        }).catch(function(error){
          _this.message = JSON.parse(error.responseText).message;
        });
      }
      catch(e){
        _this.message = 'The document is not valid';
      }
     
    }

  });
})();