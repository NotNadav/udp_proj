import socket

def udp_server():
    localIP     = "127.0.0.1"
    localPort   = 20001
    bufferSize  = 1024
    
    UDPServerSocket = socket.socket(family=socket.AF_INET, type=socket.SOCK_DGRAM)
    UDPServerSocket.bind((localIP, localPort))
    print("UDP server up and listening")
    
    while(True):
        bytesAddressPair = UDPServerSocket.recvfrom(bufferSize)
        message = bytesAddressPair[0]
        address = bytesAddressPair[1]
        
        clientMsg = f"Message from Client:{message.decode('utf-8')}"
        print(clientMsg)
        
        UDPServerSocket.sendto(str.encode("Hello UDP Client"), address)

if __name__ == '__main__':
    udp_server()
