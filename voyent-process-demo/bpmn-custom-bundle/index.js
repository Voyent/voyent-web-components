var BpmnModeler = require('bpmn-js/lib/Modeler');
var propertiesPanelModule = require('bpmn-js-properties-panel');
var propertiesProviderModule = require('bpmn-js-properties-panel/lib/provider/camunda');
var camundaModdleDescriptor = require('camunda-bpmn-moddle/resources/camunda');

module.exports = BpmnModeler;
module.exports.propertiesPanelModule = propertiesPanelModule;
module.exports.propertiesProviderModule = propertiesProviderModule;
module.exports.camundaModdleDescriptor = camundaModdleDescriptor;

