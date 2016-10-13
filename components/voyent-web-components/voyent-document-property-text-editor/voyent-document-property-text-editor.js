(function() {
  'use strict';

  Polymer({
    is: 'voyent-document-property-text-editor',
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
       * Attribute used with the document when pulling data
       */
      documentProperty: {
        notify: true,
        type: String,
        observer: "_updateNewDocument"
      },
      /**
       * Parsed version of the document
       */
      serializedDocumentProperty: {
        notify: true,
        type: String
      },
      /**
       * Underlying TinyMCE editor object
       */
      _editor: {
        type: Object
      },
      /**
       * Determine if we should use and display a TinyMCE editor
       */
      displayEditor: {
        type: Boolean,
        computed: 'computeDisplayEditor(document, documentProperty)'
      }
    },

    created: function() {
      var _this = this;
      if (!('tinymce' in window)) {
        //load missing tinymce dependency
        this.importHref(this.resolveUrl('../common/imports/tinymce.html'), function(e) {
          document.head.appendChild(document.importNode(e.target.import.body,true));
        }, function(err) {
          _this.fire('message-error', 'voyent-document-property-text-editor: error loading tinymce ' + err);
          console.error('voyent-document-property-text-editor: error loading tinymce',err);
        });
      }
    },

    /**
     * Update the document, including serialization and the underlying editor
     */
    _updateEditor: function(){
      console.log('_updateEditor()');
      var _this = this;
      if( _this.displayEditor ){
        var documentToDisplay = this.document[this.documentProperty];
        if( typeof documentToDisplay === 'object'){
          this.serializedDocumentProperty = JSON.stringify(documentToDisplay);
        }
        else{
          this.serializedDocumentProperty = documentToDisplay;
        }
        if( !_this._editor ){
          tinymce.init({
            selector: ".document-editor-container", //TODO narrow this,
            plugins: 'autosave'
          });
        }
        
        setTimeout(function(){
          if( tinymce.activeEditor ){
            _this._editor = tinymce.activeEditor;
            _this._editor.on('SaveContent', function(e) {
              _this._updateDocumentFromEditor(_this);
            });
            _this._editor.show();
            _this._editor.setContent(_this.serializedDocumentProperty);
          }
          else{
            console.log('voyent-document-editor has no active editor');
          }
        },200);
      }
      else{
        if( _this._editor ){
          console.log('hiding editor');
          _this._editor.hide();
        }
      }
    },

    /**
     * Retrieve a document from the service using our documentId (if possible)
     */
    _updateNewDocumentId: function(){
      console.log('_updateNewDocumentId()');
      if( this.documentId ){
        var _this = this;
        voyent.io.docs.getDocument({id: this.documentId}).then(function(doc){
          _this.document = doc;
        });
      }
      else{
        this.document = null;
        this.content = null;
      }
      
    },

    /**
     * Update our document and editor after determining if we have a new document or documentId
     */
    _updateNewDocument: function(){
      console.log('_updateNewDocument()');
      var _this = this;
      this.documentId = this.document ? this.document._id : null;
      this._updateEditor();      
    },

    /**
     * Use our document (and the serialized version) from our underlying editor
     */
    _updateDocumentFromEditor: function(_this){
      if( _this.document ){
        _this.serializedDocumentProperty = _this._editor.getContent();
        _this.document[_this.documentProperty] = _this.serializedDocumentProperty;
      }
    },

    /**
     * Update our document in the service
     */
    saveDocument: function(){
      var _this = this;
      this._updateDocumentFromEditor(_this);
      voyent.io.docs.updateDocument({id: this.documentId, document: _this.document}).then(function(){
        _this.message = 'Successfully updated the document.';
      }).catch(function(error){
        _this.message = JSON.parse(error.responseText).message;
      });
    },

    /**
     * Computed binding to determine if we have a document and proper data attribute
     */
    computeDisplayEditor: function(document, documentProperty){
      return !!document && !!documentProperty && documentProperty in document;
    }
  });
})();