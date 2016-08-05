(function() {
  'use strict';

  Polymer({
    is: 'voyent-document-json-editor',
    behaviors: [VoyentCommonPropertiesBehavior],

    ready: function(){
      
    },

    properties: {
      /**
       * Collection to interact with
       * @default documents
       */
      collection: {
        notify: true,
        type: String,
        value: 'documents',
        reflectToAttribute: true
      },
      /**
       * The document ID to interact with
       */
      documentId: {
        notify: true,
        type: String,
        observer: "_updateNewDocumentId"
      },
      /**
       * Document object from the service
       */
      document: {
        notify: true,
        type: Object,
        observer: "_updateNewDocument"
      },
      /**
       * Parsed version of the document
       */
      serializedDocument: {
        notify: true,
        type: String
      },
      /**
       * Attribute used with the document when pulling data
       */
      attrToEdit: {
        notify: true,
        type: String
      },
      /**
       * Store/mirror a copy of the text area contents showing our document
       */
      _codeMirror: {
        type: Object
      },
      /**
       * Determine if we can correctly parse our document to JSON, aka is it valid
       */
      editedDocumentIsValid: {
        type: Boolean,
        computed: '_computeEditedDocumentIsValid(serializedDocument)'
      },
      /**
       * Error or info message specific to this component
       */
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

    /**
     * Update the document, including serialization and code mirroring
     */
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
          console.log('voyent-document-json-editor could not find editor container');
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

    /**
     * Retrieve a document from the service using our documentId (if possible)
     */
    _updateNewDocumentId: function(){
      console.log('_updateNewDocumentId()');
      if( this.documentId ){
        var _this = this;
        voyent.io.documents.getDocument({id: this.documentId}).then(function(doc){
          _this.document = doc;
        });
      }
      else{
        this.document = null;
        this.content = null;
      }
      
    },

    /**
     * Update our document after determining if we have a new document or documentId
     */
    _updateNewDocument: function(){
      console.log('_updateNewDocument()');
      var _this = this;
      this.documentId = this.document ? this.document._id : null;
      this._updateEditor();      
    },

    /**
     * Observer change fired when various properties are changed
     * This will update our stored output
     */
    _attributesChanged: function(attrToEdit){
      this._updateEditor();
    },

    /**
     * Determine if our serialized document can correctly be parsed to JSON
     * If it can we consider the document valid and return true
     */
    _computeEditedDocumentIsValid: function(serializedDocument){
      try{
        JSON.parse(serializedDocument);
        return true;
      }
      catch(e){
        return false;
      }
    },

    /**
     * Update our document in the service
     */
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
        voyent.io.documents.updateDocument({id: this.documentId, document: this.document}).then(function(){
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