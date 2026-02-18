import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TaskMesh API',
      version: '1.0.0',
      description: 'TaskMesh API — manage boards, columns, tasks, and integrations with Azure DevOps, ServiceNow, and email connectors.',
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key in tm01.<uuid> format',
        },
      },
    },
    security: [
      { BearerAuth: [] },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
