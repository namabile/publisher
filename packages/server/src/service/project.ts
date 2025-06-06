import * as fs from "fs/promises";
import { components } from "../api";
import { Package } from "./package";
import { ApiConnection } from "./model";
type ApiPackage = components["schemas"]["Package"];
import { createConnections } from "./connection";
import { ConnectionNotFoundError } from "../errors";
import { BaseConnection } from "@malloydata/malloy/connection";
import * as path from "path";
import { ProjectNotFoundError } from "../errors";
import { API_PREFIX } from "../constants";
type ApiProject = components["schemas"]["Project"];

export class Project {
   private packages: Map<string, Package> = new Map();
   private malloyConnections: Map<string, BaseConnection>;
   private apiConnections: ApiConnection[];
   private projectPath: string;
   private projectName: string;

   constructor(
      projectName: string,
      projectPath: string,
      malloyConnections: Map<string, BaseConnection>,
      apiConnections: ApiConnection[],
   ) {
      this.projectName = projectName;
      this.projectPath = projectPath;
      this.malloyConnections = malloyConnections;
      this.apiConnections = apiConnections;
   }

   static async create(projectName: string, projectPath: string): Promise<Project> {
      if (!(await fs.stat(projectPath)).isDirectory()) {
         throw new ProjectNotFoundError(`Project path ${projectPath} not found`);
      }
      const { malloyConnections, apiConnections } = await createConnections(projectPath);
      return new Project(projectName, projectPath, malloyConnections, apiConnections);
   }

   public async getProjectMetadata(): Promise<ApiProject> {
      let readme = "";
      try {
         readme = (
            await fs.readFile(path.join(this.projectPath, "README.md"))
         ).toString();
      } catch (error) {
         console.error(error);
      }
      return {
         resource: `${API_PREFIX}/projects/${this.projectName}`,
         name: this.projectName,
         readme: readme,
      };
   }

   public listApiConnections(): ApiConnection[] {
      return this.apiConnections;
   }

   public getApiConnection(connectionName: string): ApiConnection {
      const connection = this.apiConnections.find((connection) => connection.name === connectionName);
      if (!connection) {
         throw new ConnectionNotFoundError(`Connection ${connectionName} not found`);
      }
      return connection;
   }

   public getMalloyConnection(connectionName: string): BaseConnection {
      const connection = this.malloyConnections.get(connectionName);
      if (!connection) {
         throw new ConnectionNotFoundError(`Connection ${connectionName} not found`);
      }
      return connection;
   }

   public async listPackages(): Promise<ApiPackage[]> {
      const files = await fs.readdir(this.projectPath, { withFileTypes: true });
      const packageMetadata = await Promise.all(
         files
            .filter((file) => file.isDirectory())
            .map(async (directory) => {
               try {
                  const _package = await this.getPackage(directory.name, false);
                  return _package.getPackageMetadata();
               } catch {
                  return undefined;
               }
            }),
      );
      // Get rid of undefined entries (i.e, directories without malloy-package.json files).
      return packageMetadata.filter((metadata) => metadata) as ApiPackage[];
   }

   public async getPackage(packageName: string, reload: boolean): Promise<Package> {
      let _package = this.packages.get(packageName);
      if (_package === undefined || reload) {
         _package = await Package.create(
            this.projectName,
            packageName,
            path.join(this.projectPath, packageName),
            this.malloyConnections,
         );
         this.packages.set(packageName, _package);
      }
      return _package;
   }
}
