/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "server",
      region: "us-east-1",
      providers: {
        aws: {
          profile: "3agent",
        },
      },
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    /* --------------------------------------------
    // Dynamo Tables
    -------------------------------------------- */

    // Create a user dynamo table
    const agentData = new sst.aws.Dynamo("AgentData", {
      fields: {
        agentId: "string", // Partition key
      },
      primaryIndex: { hashKey: "agentId" },
    });

    // Create a rate limit dynamo table
    const userData = new sst.aws.Dynamo("UserData", {
      fields: {
        userId: "string", // Partition key
        agentId: "string", // Sort key
      },
      primaryIndex: { hashKey: "userId", rangeKey: "agentId" },
    });

    const agentMapping = new sst.aws.Dynamo("AgentMapping", {
      fields: {
        agentId: "string", // Partition key
        container: "string", // Sort key
      },
      primaryIndex: { hashKey: "agentId", rangeKey: "container" },
    });

    /* --------------------------------------------
    // Functions
    -------------------------------------------- */

    // // Create an agent
    const start = new sst.aws.Function("Start", {
      handler: "source/functions/start.handler",
      link: [agentMapping, agentData],
      environment: {
        API_KEY: process.env.API_KEY || "",
        SERVICE_URL: process.env.SERVICE_URL || "",
      },
    });

    // Fetch agent data
    const fetch = new sst.aws.Function("Fetch", {
      handler: "source/functions/fetch.handler",
      link: [agentData, userData],
      environment: {
        API_KEY: process.env.API_KEY || "",
      },
    });

    // Create agent
    const create = new sst.aws.Function("Create", {
      handler: "source/functions/create.handler",
      link: [agentData, userData],
      environment: {
        API_KEY: process.env.API_KEY || "",
      },
    });

    // Update agent data
    const update = new sst.aws.Function("Update", {
      handler: "source/functions/update.handler",
      link: [agentData],
      environment: {
        API_KEY: process.env.API_KEY || "",
      },
    });

    // Delete agent
    const remove = new sst.aws.Function("Remove", {
      handler: "source/functions/remove.handler",
      link: [agentData, userData],
      environment: {
        API_KEY: process.env.API_KEY || "",
      },
    });

    /* --------------------------------------------
    // API Gateway
    -------------------------------------------- */

    const api = new sst.aws.ApiGatewayV2("AgentApi");

    api.route("GET /agent", fetch.arn);
    api.route("POST /start", start.arn);
    api.route("POST /update", update.arn);
    api.route("POST /create", create.arn);
    api.route("DELETE /remove", remove.arn);
  },
});
