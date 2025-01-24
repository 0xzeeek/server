import { Resource } from "sst";
import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import axios, { AxiosError } from "axios";
import { checkApiKey } from "./utils/auth";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

interface CreateAgentRequest {
  agentId: string;
  characterFile: string;
  twitterCredentials: {
    username: string;
    email: string;
    password: string;
  };
}

interface ContainerResponse {
  success: boolean;
  data?: {
    container: string;
  };
  error?: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    // TODO: add auth
    // const authError = checkApiKey(event);
    // if (authError) return authError;

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Missing request body",
        }),
      };
    }

    const { agentId, characterFile, twitterCredentials }: CreateAgentRequest = JSON.parse(event.body);

    if (!agentId || !characterFile || !twitterCredentials) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Missing required fields: agentId, characterFile, and twitterCredentials",
        }),
      };
    }

    const serviceUrl = process.env.SERVICE_URL;
    if (!serviceUrl) {
      console.error(new Error("SERVICE_URL environment variable is not set"));
      throw new Error("SERVICE_URL environment variable is not set");
    }

    // Call the container's start endpoint
    try {
      const createResponse = await axios.post<ContainerResponse>(`${serviceUrl}/start`, {
        agentId,
        characterFile,
        twitterCredentials,
      });

      const { data } = createResponse;

      // Handle case where metadata isn't ready yet
      if (data.error === "Container metadata not yet available") {
        return {
          statusCode: 503,
          body: JSON.stringify({
            success: false,
            error: "Service temporarily unavailable - please retry",
          }),
        };
      }

      if (!data.success || !data.data?.container) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            error: "Failed to initialize agent in container",
          }),
        };
      }

      // Add mapping to DynamoDB
      await ddb.send(
        new PutCommand({
          TableName: Resource.AgentMapping.name,
          Item: {
            agentId,
            container: data.data.container,
            status: "RUNNING",
            createdAt: new Date().toISOString(),
          },
        })
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          data: {
            agentId,
            container: data.data.container,
          },
        }),
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 503) {
          return {
            statusCode: 503,
            body: JSON.stringify({
              success: false,
              error: "Service temporarily unavailable - please retry",
            }),
          };
        }
      }
      throw error; 
    }
  } catch (error) {
    console.error(new Error("Error creating agent:", { cause: error }));
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
    };
  }
};
