(function() {
  'use strict';

  Polymer({
    is: 'voyent-document',
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
        observer: "_updateOutputWithNewDocumentId"
      },
      /**
       * Document object from the service
       */
      document: {
        notify: true,
        type: Object,
        observer: "_updateOutputWithNewDocument"
      },
      /**
       * Whether we use syntax highlighting or not
       */
      highlight: {
        notify: true,
        type: Boolean
      },
      /**
       * Store the stringified output
       */
      output: {
        notify: true,
        type: String
      },
      /**
       * Attribute used with the document when pulling data
       */
      attrToDisplay: {
        notify: true,
        type: String
      },
      
    },

    observers: [
      '_attributesChanged(highlight, attrToDisplay)'
    ],

    listeners: {
    },

    /**
     * Using our existing document update our output, which may be formatted and highlighted
     */
    _updateOutput: function(){
      console.log('_updateOutput()');
      if( this.document ){
        var documentToDisplay;
        //if an attribute to display is 
        if( this.attrToDisplay ){
          documentToDisplay = this.document[this.attrToDisplay];
        }
        else{
          documentToDisplay = this.document;
        }
        if( this.highlight ){
          this.output = '<pre>' + this._syntaxHighlight(JSON.stringify(documentToDisplay, undefined, 4)) + '</pre>';      
        }
        else{
          if( !this.highlight && typeof documentToDisplay === 'object'){
            this.output = JSON.stringify(documentToDisplay);
          }
          else{
            this.output = documentToDisplay;
          }
        }
      }
      else{
        this.output = '';
      }
      Polymer.dom(this.root).innerHTML = this.output;
    },

    /**
     * Pull a document from the service using our documentId
     */
    _updateOutputWithNewDocumentId: function(){
      console.log('_updateOutputWithNewDocumentId()');
      if( this.documentId ){
        var _this = this;
        voyent.docs.getDocument({id: this.documentId}).then(function(doc){
          _this.document = doc;
        });
      }
      else{
        this.document = null;
        this.content = null;
      }
      
    },

    /**
     * Update our output after determining if we have a new document or documentId
     */
    _updateOutputWithNewDocument: function(){
      console.log('_updateOutputWithNewDocument()');
      var _this = this;
      this.documentId = this.document ? this.document._id : null;
      this._updateOutput();      
    },

    /**
     * Observer change fired when various properties are changed
     * This will update our stored output
     */
    _attributesChanged: function(highlight, attrToDisplay){
      this._updateOutput();
    },

    /**
     * Function to stringify our document JSON and use syntax highlighting
     */
    _syntaxHighlight: function(json) {
      if( json ){
        if (typeof json !== 'string') {
          json = JSON.stringify(json, undefined, 2);
        }
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
          var cls = 'number';
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = 'key';
            } else {
              cls = 'string';
            }
          } else if (/true|false/.test(match)) {
            cls = 'boolean';
          } else if (/null/.test(match)) {
            cls = 'null';
          }
          return '<span class="' + cls + '">' + match + '</span>';
        });
      }
      else{
        return '<span>Empty</span>';
      }
    }
  });
})();