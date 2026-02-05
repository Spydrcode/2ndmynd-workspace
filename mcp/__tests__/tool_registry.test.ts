/**
 * MCP Tool Registry Contract Test
 * 
 * Validates that the MCP tool registry contract is intact:
 * - Required tools are registered
 * - Tool schemas are valid
 * - Tool names match expected call sites
 */

import { describe, it, expect } from "vitest";
import { listTools, callTool, compileSchemasSelfTest } from "../tool_registry";

describe("MCP Tool Registry Contract", () => {
  it("should have registered tools", () => {
    const tools = listTools();
    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });
  
  it("should have required pipeline tools", () => {
    const tools = listTools();
    const toolNames = tools.map((t) => t.name);
    
    // Check for critical tools used in pipeline
    const requiredTools = [
      "pipeline.run_v2",
      "decision.infer_v2",
      "decision.validate_v2",
    ];
    
    for (const toolName of requiredTools) {
      expect(toolNames).toContain(toolName);
    }
  });
  
  it("should compile schemas without errors", () => {
    expect(() => compileSchemasSelfTest()).not.toThrow();
  });
  
  it("should have valid tool schemas", () => {
    const tools = listTools();
    
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe("string");
      
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe("object");
    }
  });
  
  it("should be able to call tools (smoke test)", async () => {
    // This is a basic smoke test - just verify callTool function exists
    // Don't actually run tools here as they may require setup
    expect(typeof callTool).toBe("function");
  });
});
