import { APIGatewayProxyEventV2 } from "aws-lambda";

export interface AuthResponse {
  statusCode: number;
  body: string;
}

export function checkApiKey(event: APIGatewayProxyEventV2): AuthResponse | null {
  const apiKey = event.headers['x-api-key'];
  console.log(apiKey);
  console.log(process.env.API_KEY);
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: "Unauthorized",
      }),
    };
  }
  return null;
}