(function() {
  'use strict';

  Polymer({
    is: 'bridgeit-document-property-text-editor',
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
      documentProperty: {
        notify: true,
        type: String,
        observer: "_updateNewDocument"
      },
      serializedDocumentProperty: {
        notify: true,
        type: String
      },
      _editor: {
        type: Object
      },
      displayEditor: {
        type: Boolean,
        computed: 'computeDisplayEditor(document, documentProperty)'
      }
    },

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
        tinymce.init({
          selector: ".document-editor-container", //TODO narrow this,
          plugins: 'autosave'
        });
        setTimeout(function(){
          if( tinymce.activeEditor ){
            _this._editor = tinymce.activeEditor;
            _this._editor.setContent(_this.serializedDocumentProperty);
            _this._editor.on('SaveContent', function(e) {
              _this._updateDocumentFromEditor(_this);
            });
          }
          else{
            console.log('bridgeit-document-editor has no active editor');
          }
        },200);
      }
      else{
        if( _this._editor ){
          _this._editor.hide();
        }
      }
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

    _updateDocumentFromEditor: function(_this){
      _this.serializedDocumentProperty = _this._editor.getContent();
      _this.document[_this.documentProperty] = _this.serializedDocumentProperty;
    },

    saveDocument: function(){
      var _this = this;
      this._updateDocumentFromEditor(_this);
      bridgeit.io.documents.updateDocument({id: this.documentId, document: _this.document}).then(function(){
        _this.message = 'Successfully updated the document.';
      }).catch(function(error){
        _this.message = JSON.parse(error.responseText).message;
      });
    },

    computeDisplayEditor: function(document, documentProperty){
      return !!document && !!documentProperty && documentProperty in document;
    }
  });
})();