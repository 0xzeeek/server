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
    // API Gateway
    -------------------------------------------- */
    const api = new sst.aws.ApiGatewayV2("AgentApi");

    /* --------------------------------------------
    // Dynamo Tables
    -------------------------------------------- */

    // Agent data dynamo table
    const agentData = new sst.aws.Dynamo("AgentData", {
      fields: {
        agentId: "string", // Partition key
        remove: "string",
        createdAt: "string",
      },
      primaryIndex: { hashKey: "agentId" },
      globalIndexes: {
        // GSI for "remove" so we can query by removal status
        byRemovalStatus: {
          hashKey: "remove",
          rangeKey: "createdAt",
        },
      },
    });

    // User data dynamo table
    const userData = new sst.aws.Dynamo("UserData", {
      fields: {
        userId: "string", // Partition key
        agentId: "string", // Sort key
      },
      primaryIndex: { hashKey: "userId", rangeKey: "agentId" },
    });

    // Agent mapping table
    const agentMapping = new sst.aws.Dynamo("AgentMapping", {
      fields: {
        taskArn: "string", // Partition key
        agentId: "string",
        status: "string",
      },
      primaryIndex: { hashKey: "agentId" },
      globalIndexes: {
        byStatus: {
          hashKey: "status",
        },
        byTaskArn: {
          hashKey: "taskArn",
        },
      },
    });

    const agentTwitterMapping = new sst.aws.Dynamo("AgentTwitterMapping", {
      fields: {
        username: "string",
      },
      primaryIndex: { hashKey: "username" },
    });

    /* --------------------------------------------
    // Functions
    -------------------------------------------- */

    // Agent start function
    const start = new sst.aws.Function("Start", {
      handler: "source/functions/start.handler",
      link: [agentMapping],
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
      link: [agentData, userData, agentTwitterMapping, api],
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

    // Remove agent
    const remove = new sst.aws.Function("Remove", {
      handler: "source/functions/remove.handler",
      link: [agentData, userData, agentMapping, agentTwitterMapping],
      environment: {
        API_KEY: process.env.API_KEY || "",
      },
    });

    /* --------------------------------------------
    // Agent Health
    -------------------------------------------- */
    // update mapping functions
    const updateMapping = new sst.aws.Function("UpdateMapping", {
      handler: "source/jobs/updateMapping.handler",
      link: [agentMapping],
    });

    // listening bus for ecs task state change
    const defaultBusArn = "arn:aws:events:us-east-1:692859940880:event-bus/default";
    sst.aws.Bus.subscribe("EcsStoppedSubscription", defaultBusArn, updateMapping.arn, {
      pattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          lastStatus: ["STOPPED"],
        },
      },
    });

    const restartAgents = new sst.aws.Function("RestartAgents", {
      handler: "source/jobs/restartAgents.handler",
      link: [agentMapping, agentData, api],
    });

    new sst.aws.Cron("RestartAgentsCron", {
      function: restartAgents.arn,
      schedule: "rate(30 minutes)",
    });

    /* --------------------------------------------
    // Agent removal
    -------------------------------------------- */

    const removeAgents = new sst.aws.Function("RemoveAgents", {
      handler: "source/jobs/removeAgents.handler",
      link: [agentData],
      environment: {
        RPC_URL: process.env.RPC_URL || "",
      },
    });

    new sst.aws.Cron("RemoveAgentsCron", {
      function: removeAgents.arn,
      schedule: "rate(1 hour)",
    });

    /* --------------------------------------------
    // API Endpoints
    -------------------------------------------- */

    api.route("GET /agent", fetch.arn);
    api.route("POST /start", start.arn);
    api.route("POST /update", update.arn);
    api.route("POST /create", create.arn);
    api.route("DELETE /remove", remove.arn);
  },
});
