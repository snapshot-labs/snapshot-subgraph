# Snapshot Subgraph

This subgraph indexes the data from the Snapshot delegation contracts.

## To add new network

- Create a new file similar to `subgraph.sepolia.yaml`
- Find `startBlock` of contract on new network
- Create a new script in package.json similar to `deploy-studio-sepolia`

### How to deploy to studio

Refer to documentation [here](https://thegraph.com/docs/en/deploying/deploying-a-subgraph-to-studio/)

- Run `yarn codegen` to generate the types for the subgraph
- Run `yarn build` to build the subgraph
- Run `yarn deploy-studio-sepolia --deploy-key=<DEPLOY_CODE_HERE>`
