# custom bower bundles

##
This internal project is based on https://github.com/bpmn-io/bpmn-js-examples/tree/master/custom-bower-bundle
The intent is to package bpmn-io.js (both viewer and modeler) with the bpmn-js-properties-panel project into a single Javascript file.

The Voyent Process Demo requires the bpmn-js-properties-panel project, which is Node based and doesn't have a pre-packaged web version.
(At the time of this writing. See this issue for potential fixes: https://github.com/bpmn-io/bpmn-js/issues/520)

##
To install run:

npm install
grunt browserify:bower

This will create the combined Javascript file as dist/bpmn-js-custom.js
