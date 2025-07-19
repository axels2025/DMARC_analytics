import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDropzone } from "react-dropzone";
import { toast } from "@/hooks/use-toast";

const UploadSimple = () => {
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `${timestamp}: ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev.slice(-9), logMessage]); // Keep last 10 logs
  };

  const processFile = useCallback((file: File) => {
    addLog(`processFile called with: ${file.name} (${file.size} bytes, type: ${file.type})`);
    
    toast({
      title: "File Selected",
      description: `Selected file: ${file.name}`,
    });
  }, []);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: { file: File; errors: { code: string; message: string }[] }[]) => {
    addLog(`onDrop called - accepted: ${acceptedFiles.length}, rejected: ${rejectedFiles.length}`);
    
    rejectedFiles.forEach((fileRejection, index) => {
      const { file, errors } = fileRejection;
      addLog(`Rejected file ${index}: ${file.name} - ${errors.map((e: { code: string; message: string }) => e.message).join(', ')}`);
    });
    
    acceptedFiles.forEach((file, index) => {
      addLog(`Accepted file ${index}: ${file.name}`);
      processFile(file);
    });
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
      '': ['.xml'] // For files with no detected MIME type
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    onDropAccepted: (files) => addLog(`onDropAccepted: ${files.length} files`),
    onDropRejected: (rejections) => addLog(`onDropRejected: ${rejections.length} rejections`),
    onFileDialogCancel: () => addLog('File dialog cancelled'),
    onFileDialogOpen: () => addLog('File dialog opened'),
  });

  // Test button to manually trigger file input
  const handleTestClick = () => {
    addLog('Test button clicked');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        addLog(`Manual file selected: ${files[0].name}`);
        processFile(files[0]);
      }
    };
    input.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Simple Upload Test</h1>
        <p className="text-gray-600 mt-1">Testing file upload functionality</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Test Area</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4 ${
              isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input {...getInputProps()} />
            <p className="text-lg mb-2">
              {isDragActive ? 'Drop XML file here' : 'Click or drag XML file here'}
            </p>
            <Button variant="outline">Browse Files</Button>
          </div>
          
          <Button onClick={handleTestClick} variant="secondary" className="mb-4">
            Test Manual File Selection
          </Button>
          
          <div className="bg-gray-100 p-4 rounded max-h-64 overflow-y-auto">
            <h3 className="font-bold mb-2">Activity Log:</h3>
            {logs.length === 0 ? (
              <p className="text-gray-500 text-sm">No activity yet...</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-sm font-mono mb-1">{log}</div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UploadSimple;