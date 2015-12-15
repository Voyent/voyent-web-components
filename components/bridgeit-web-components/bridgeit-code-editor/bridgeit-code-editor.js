var BridgeIt = BridgeIt || {};

BridgeIt.CodeEditor = Polymer({
    is: "bridgeit-code-editor",

    properties: {
        /**
         * The size of the font (in pixels) for the editor text.
         */
        fontsize: { type: Number, value: 12, observer: '_fontsizeChanged' },
        /**
         * Whether to use hard tabs for the tab character. Hard tabs means you're using tab characters instead of spaces.
         */
        hardtabs: { type: Boolean, value: false, observer: '_hardtabsChanged' },
        /**
         * The programming language mode, see here for a list of available options: https://github.com/ajaxorg/ace/tree/master/lib/ace/mode.
         */
        mode: { type: String, value: 'javascript', observer: '_modeChanged' },
        /**
         * Whether to set the input mode to overwrite. If enabled any text you enter will type over any text after it.
         */
        overwrite: { type: Boolean, value: false, observer: '_overwriteChanged' },
        /**
         * Whether to set use read-only mode. If enabled none of the content can change.
         */
        readonly: { type: Boolean, value: false, observer: '_readonlyChanged' },
        /**
         * Whether to disable syntax validation. More info here: https://github.com/ajaxorg/ace/wiki/Syntax-validation.
         */
        disablevalidation: { type: Boolean, value: false, observer: '_disablevalidationChanged' },
        /**
         * The number of spaces that define a soft tab. This attribute is only relevant when `hardtabs` is false.
         */
        tabsize: { type: Number, value: 4, observer: '_tabsizeChanged' },
        /**
         * The theme, see here for a list of available options: https://github.com/ajaxorg/ace/tree/master/lib/ace/theme.
         */
        theme: { type: String, value: 'textmate', observer: '_themeChanged' },
        /**
         * The current value of the code editor. Data binding is enabled for this attribute.
         */
        value: { type: String,  observer: '_valueChanged', notify: true }
    },

    ready: function() {
        var _this = this;
        var codeEditorURL = this.resolveUrl('./code-editor-import.html');
        //load missing ace-editor dependency
        if (!('ace' in window)) {
            _this.importHref(codeEditorURL, function(e) {
                document.head.appendChild(document.importNode(e.target.import.body,true));
                _this._initialize();
            }, function(err) {
                console.error('bridgeit-code-editor: error loading ace editor dependency', err);
            });
        }
        else { _this._initialize(); }
    },


    //******************PRIVATE API******************

    _initialize: function() {
        //initialize editor
        this.editor = ace.edit(this.$.editor);
        //set some static defaults
        this.editor.setShowPrintMargin(false);
        this.editor.$blockScrolling = Infinity; //disable console warning
        //set default properties
        this._setProperties();
        //add any listeners
        this._addListeners();
    },
    _addListeners: function() {
        var _this = this;
        this.editor.addEventListener('change',function(e) {
            _this._ignoreValueChange = true;
            _this.value = _this.editor.getValue();
        });
    },
    _setProperties: function() {
        var session = this.editor.getSession();

        if (this.fontsize && typeof this.fontsize==='number' && (this.fontsize%1) === 0) {
            this.editor.setFontSize(this.fontsize);
        }
        if (this.hardtabs === true || this.hardtabs === false) {
            session.setUseSoftTabs(!this.hardtabs);
        }
        if (this.mode && this.mode.trim().length > 0) {
            session.setMode('ace/mode/'+this.mode);
        }
        if (this.overwrite === true || this.overwrite === false) {
            session.setOverwrite(this.overwrite);
        }
        if (this.readonly === true || this.readonly === false) {
            this.editor.setReadOnly(this.readonly);
        }
        if (this.disablevalidation === true || this.disablevalidation === false) {
            session.setOption("useWorker",!this.disablevalidation);
        }
        if (this.tabsize && typeof this.tabsize==='number' && (this.tabsize%1) === 0) {
            session.setTabSize(this.tabsize);
        }
        if (this.theme && this.theme.trim().length > 0) {
            this.editor.setTheme('ace/theme/' + this.theme);
        }
        if (this.value) {
            session.setValue(this.value);
        }
    },
    _fontsizeChanged: function(newVal,oldVal) {
        if (!this.editor || typeof newVal!=='number' || (newVal%1) !== 0) {
            return;
        }
        this.editor.setFontSize(newVal);
    },
    _hardtabsChanged: function(newVal,oldVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.getSession().setUseSoftTabs(!newVal);
    },
    _modeChanged: function(newVal,oldVal) {
        if (!this.editor || !newVal || newVal.trim().length === 0) {
            return;
        }
        this.editor.getSession().setMode('ace/mode/'+newVal);
    },
    _overwriteChanged: function(newVal,oldVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.getSession().setOverwrite(newVal);
    },
    _readonlyChanged: function(newVal,oldVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.setReadOnly(newVal);
    },
    _disablevalidationChanged: function(newVal,oldVal) {
        if (!this.editor || (newVal !== true && newVal !== false)) {
            return;
        }
        this.editor.getSession().setOption("useWorker",!newVal);
    },
    _tabsizeChanged: function(newVal,oldVal) {
        if (!this.editor || !newVal || newVal.trim().length === 0) {
            return;
        }
        this.editor.getSession().setTabSize(newVal);
    },
    _themeChanged: function(newVal,oldVal) {
        if (!this.editor || !newVal || newVal.trim().length === 0) {
            return;
        }
        this.editor.setTheme('ace/theme/'+newVal);
    },
    _valueChanged: function(newVal,oldVal) {
        if (!this.editor || this._ignoreValueChange) {
            this._ignoreValueChange = false;
            return;
        }
        this.editor.setValue(newVal);
    }
});