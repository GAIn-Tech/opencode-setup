import { ApiCommand } from './api';
import { AgentCommand } from './agent';
import type { BaseCommand } from './base';
import { BootstrapCommand } from './bootstrap';
import { CheckCommand } from './check';
import { CiCommand } from './ci';
import { CommitCommand } from './commit';
import { ConfigCommand } from './config';
import { DoctorCommand } from './doctor';
import { GovernanceCommand } from './governance';
import { HealthCommand } from './health';
import { IngestCommand } from './ingest';
import { InspectCommand } from './inspect';
import { McpCommand } from './mcp';
import { ModelCommand } from './model';
import { LaunchCommand } from './launch';
import { LinkCommand } from './link';
import { ReleaseCommand } from './release';
import { ReportCommand } from './report';
import { RepairCommand } from './repair';
import { ReplayCommand } from './replay';
import { ResolveCommand } from './resolve';
import { RunBatchCommand } from './run-batch';
import { RunCommand } from './run';
import { SetupCommand } from './setup';
import { SkillCommand } from './skill';
import { SyncCommand } from './sync';
import { TaskCommand } from './task';
import { TestCommand } from './test';
import { TrajectoryCommand } from './trajectory';
import { StateCommand } from './state';
import { SystemCommand } from './system';
import { ValidateCommand } from './validate';
import { VerifyCommand } from './verify';
import { RuntimeCommand } from './runtime';

export function createCommands(): BaseCommand[] {
  return [
    new ApiCommand(),
    new RunCommand(),
    new RunBatchCommand(),
    new RuntimeCommand(),
    new ReplayCommand(),
    new AgentCommand(),
    new TaskCommand(),
    new SkillCommand(),
    new RepairCommand(),
    new McpCommand(),
    new IngestCommand(),
    new TestCommand(),
    new DoctorCommand(),
    new CiCommand(),
    new CommitCommand(),
    new ConfigCommand(),
    new GovernanceCommand(),
    new LaunchCommand(),
    new LinkCommand(),
    new ReleaseCommand(),
    new ReportCommand(),
    new SyncCommand(),
    new StateCommand(),
    new SystemCommand(),
    new VerifyCommand(),
    new ValidateCommand(),
    new CheckCommand(),
    new SetupCommand(),
    new ResolveCommand(),
    new BootstrapCommand(),
    new ModelCommand(),
    new HealthCommand(),
    new InspectCommand(),
    new TrajectoryCommand()
  ];
}

export * from './agent';
export * from './api';
export * from './base';
export * from './bootstrap';
export * from './check';
export * from './ci';
export * from './commit';
export * from './config';
export * from './doctor';
export * from './governance';
export * from './health';
export * from './ingest';
export * from './inspect';
export * from './mcp';
export * from './model';
export * from './launch';
export * from './link';
export * from './release';
export * from './report';
export * from './repair';
export * from './replay';
export * from './resolve';
export * from './run';
export * from './run-batch';
export * from './runtime';
export * from './setup';
export * from './skill';
export * from './sync';
export * from './state';
export * from './system';
export * from './task';
export * from './test';
export * from './trajectory';
export * from './validate';
export * from './verify';
