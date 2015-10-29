(function() {
  'use strict';

  Polymer({
    is: 'bridgeit-document-text-editor',
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
      editAsCode: {
        notify: true,
        type: Boolean
      },
      attrToEdit: {
        notify: true,
        type: String
      },
      serializedDocument: {
        notify: true,
        type: String
      },
      _codeMirror: {
        type: Object
      }
    },

    observers: [
      '_attributesChanged(editAsCode, attrToEdit)'
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
          this.serializedDocument = JSON.stringify(documentToDisplay);
        }
        else{
          this.serializedDocument = documentToDisplay;
        }
      }
      else{
        this.serializedDocument = '';
      }
      if( _this.editAsCode ){
        _this._codeMirror = CodeMirror.fromTextArea(document.querySelector(".document-editor-container"),{
          value: _this.serializedDocument,
          mode:  "javascript"
        });
      }
      else{
        tinymce.init({
            selector: ".document-editor-container" //TODO narrow this
        });
        setTimeout(function(){
          if( tinymce.activeEditor ){
            tinymce.activeEditor.setContent(_this.serializedDocument);
          }
          else{
            console.log('bridgeit-document-editor has no active editor');
          }
        },200);
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

    _attributesChanged: function(editAsCode, attrToEdit){
      this._updateEditor();
    },
    
  });
})();