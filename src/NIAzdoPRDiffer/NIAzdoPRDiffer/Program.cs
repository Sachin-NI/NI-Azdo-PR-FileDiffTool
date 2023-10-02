using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace AzdoPRDiffer
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length != 2)
            {
                Console.WriteLine("Usage: NIAzdoPRDiffer.exe <fileName1> <fileName2>");
                return;
            }

            string[] parts = args[0].Split(':');
            string[] fileArray = parts[1].Split(",");
            string originalFileName = fileArray[0].Trim();
            string modifiedFileName = fileArray[1].Trim();

            string exePath = "";

            if (originalFileName.EndsWith(".seq") && modifiedFileName.EndsWith(".seq"))
            {
                exePath = "C:\\Program Files (x86)\\National Instruments\\Shared\\TestStand\\FileDifferLauncher.exe";
            }
            else if(originalFileName.EndsWith(".vi") && modifiedFileName.EndsWith(".vi"))
            {
                exePath = "C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe";
            }
            else
            {
                Console.WriteLine("Unsupported File Type");
                return;
            }

            string keyPath = @"HKEY_CLASSES_ROOT\NIAzdoPRDiffer\BrowserDownload";
            string valueName = "BrowserDownloadLocation";
            object value = Registry.GetValue(keyPath, valueName, null);
            string downloadLocation = "";

            if (value != null)
            {
                downloadLocation = value.ToString();
            }
            else
            {
                Console.WriteLine($"Registry value {valueName} not found.");
                return;
            }

            string originalFilePath = downloadLocation + originalFileName;
            string modifiedFilePath = downloadLocation + modifiedFileName;

            if (!File.Exists(exePath))
            {
                Console.WriteLine($"Error: The specified executable '{exePath}' was not found.");
                return;
            }

            Process process = new Process();
            process.StartInfo.FileName = exePath;
            process.StartInfo.Arguments = $"{originalFilePath} {modifiedFilePath}";

            try
            {
                process.Start();
                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    Console.WriteLine($"The launched application exited with an error code: {process.ExitCode}");
                }
                else
                {
                    File.Delete(originalFilePath);
                    File.Delete(modifiedFilePath);
                    Console.WriteLine("Files deleted successfully.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
        }
    }
}
