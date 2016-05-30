(function() {
  'use strict';

  Polymer({
    is: 'bridgeit-document',
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
        observer: "_updateOutputWithNewDocumentId"
      },
      document: {
        notify: true,
        type: Object,
        observer: "_updateOutputWithNewDocument"
      },
      highlight: {
        notify: true,
        type: Boolean
      },
      output: {
        notify: true,
        type: String
      },
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

    _updateOutputWithNewDocumentId: function(){
      console.log('_updateOutputWithNewDocumentId()');
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

    _updateOutputWithNewDocument: function(){
      console.log('_updateOutputWithNewDocument()');
      var _this = this;
      this.documentId = this.document ? this.document._id : null;
      this._updateOutput();      
    },

    _attributesChanged: function(highlight, attrToDisplay){
      this._updateOutput();
    },

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